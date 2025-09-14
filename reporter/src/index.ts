import 'dotenv/config';
import { ethers } from 'ethers';
import { loadConfig } from './config';
import { fetchAggregate } from './price';
import { jitteredDelayMs, roundToScale, sleep } from './util';

// -------------------------------
const CFG = loadConfig(process.env);

// -------------------------------
// Constants / ABI
// -------------------------------
const OracleAbi = [
  'function pushPrice(uint256 price) external',
  'function priceScale() external view returns (uint64)',
  'function heartbeat() external view returns (uint64)',
  'function lastUpdated() external view returns (uint64)',
  'function indexPrice() external view returns (uint256)'
];

// -------------------------------
// Utilities
// -------------------------------
// Main routine
// -------------------------------
async function main() {
  const provider = new ethers.JsonRpcProvider(CFG.rpcUrl);
  const wallet = new ethers.Wallet(CFG.privateKey, provider);
  const oracle = new ethers.Contract(CFG.oracleAddress, OracleAbi, wallet);

  // on-chain 値の取得（環境変数で上書き可）
  const onChainScale = BigInt(await oracle.priceScale());
  const onChainHeartbeat = BigInt(await oracle.heartbeat());

  const scale: bigint = CFG.overrideScale ?? onChainScale;
  const heartbeatSec: bigint = CFG.overrideHeartbeatSec ?? onChainHeartbeat;

  let pushIntervalMs: number = CFG.pushIntervalMs;
  const hbMs = Number(heartbeatSec) * 1000;
  if (pushIntervalMs >= hbMs) {
    console.warn(`PUSH_INTERVAL_MS(${pushIntervalMs}) が HEARTBEAT(${hbMs}) 以上です。間隔を調整します。`);
    // heartbeat より少し短くする（200ms マージン）
    pushIntervalMs = Math.max(500, hbMs - 200);
  }

  console.log('--- Oracle Reporter 起動 ---');
  console.log('network:', await provider.getNetwork());
  console.log('reporter:', await wallet.getAddress());
  console.log('oracle  :', CFG.oracleAddress);
  console.log('scale   :', scale.toString());
  console.log('heartbeat(sec):', heartbeatSec.toString());
  console.log('interval(ms)  :', pushIntervalMs);

  console.log('price sources :', CFG.priceSourceUrls.join(', '));
  const dryRun = CFG.dryRun;
  const skipSame = CFG.skipSame;
  console.log('dryRun        :', dryRun);
  console.log('skipSame      :', skipSame);
  console.log('aggregation   :', CFG.aggregation);
  console.log('retries       :', CFG.retries);
  console.log('timeout(ms)   :', CFG.requestTimeoutMs);
  console.log('jitter(pct)   :', CFG.jitterPct);
  console.log('min change bps:', CFG.priceChangeBps);

  let pushing = false;
  let lastSentPrice: bigint | undefined;
  let timer: NodeJS.Timeout | undefined;

  const pushOnce = async () => {
    if (pushing) {
      console.warn('前回の push が進行中のためスキップ');
      return;
    }
    pushing = true;
    try {
      // 0) 鮮度チェック（任意の警告）
      try {
        const lu = BigInt(await oracle.lastUpdated());
        const nowSec = BigInt(Math.floor(Date.now() / 1000));
        const age = nowSec - lu;
        if (age > heartbeatSec) {
          console.warn(`チェーン上の lastUpdated からの経過: ${age}s (> heartbeat=${heartbeatSec}s)`);
        }
      } catch (e) {
        console.warn('lastUpdated 取得に失敗（継続）:', e);
      }

      // 1) 外部価格取得（複数ソース + 集計 + リトライ）
      const offchain = await fetchAggregate(
        CFG.priceSourceUrls,
        CFG.requestTimeoutMs,
        CFG.retries,
        CFG.aggregation,
        CFG.priceJsonPath
      );
      // 2) 丸め（scale 単位）
      const onchain = roundToScale(offchain, scale);

      // 2.5) 同値スキップ（任意）
      if (skipSame || CFG.priceChangeBps > 0) {
        let chainAgeSec = 0n;
        let current: bigint | undefined;
        try {
          const [lu, cur] = await Promise.all([
            oracle.lastUpdated(),
            oracle.indexPrice()
          ]);
          const nowSec = BigInt(Math.floor(Date.now() / 1000));
          chainAgeSec = nowSec - BigInt(lu);
          current = BigInt(cur);
        } catch (e) {
          console.warn('オンチェーン情報取得失敗（skip判定を継続）:', e);
        }

        if (lastSentPrice !== undefined && lastSentPrice === onchain) {
          console.log('同値（直近送信値）→ 送信スキップ:', onchain.toString());
          return;
        }
        if (current !== undefined) {
          if (current === onchain) {
            console.log('同値（オンチェーン）→ 送信スキップ:', onchain.toString());
            return;
          }
          if (CFG.priceChangeBps > 0) {
            const diff = onchain > current ? onchain - current : current - onchain;
            const bps = Number((diff * 10000n) / (current === 0n ? 1n : current));
            const halfHb = heartbeatSec / 2n;
            if (bps < CFG.priceChangeBps && chainAgeSec <= halfHb) {
              console.log(`変化${bps}bps < 閾値${CFG.priceChangeBps}bps かつ age<=heartbeat/2 → スキップ`);
              return;
            }
          }
        }
      }

      // 3) 送信（ガス設定 or ドライラン）
      if (dryRun) {
        const now = Math.floor(Date.now() / 1000);
        console.log(`DRY_RUN: pushPrice(${onchain.toString()}) ts=${now}`);
        lastSentPrice = onchain;
        return;
      }
      const fee = await provider.getFeeData();
      const tx = await oracle.pushPrice(onchain, {
        maxFeePerGas: fee.maxFeePerGas ?? undefined,
        maxPriorityFeePerGas: fee.maxPriorityFeePerGas ?? undefined
      });
      const rec = await tx.wait();

      const now = Math.floor(Date.now() / 1000);
      console.log(
        `pushed price=${onchain.toString()} ts=${now} tx=${rec?.hash}`
      );
      lastSentPrice = onchain;
    } catch (err) {
      console.error('push 失敗:', err);
    } finally {
      pushing = false;
    }
  };

  // ループ: setTimeout でジッターを入れる
  const loop = async () => {
    try {
      await pushOnce();
    } finally {
      const next = jitteredDelayMs(pushIntervalMs, CFG.jitterPct);
      timer = setTimeout(loop, next);
    }
  };
  await loop();

  // Graceful shutdown
  const shutdown = async (sig: string) => {
    console.log(`受信: ${sig}、シャットダウンします…`);
    if (timer) clearTimeout(timer);
    // 最後に軽く待機
    await sleep(200);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((e) => {
  console.error('致命的エラー:', e);
  process.exit(1);
});

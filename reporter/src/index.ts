import 'dotenv/config';
import { ethers } from 'ethers';
import { loadConfig } from './config';
import { fetchAggregate } from './price';
import { computeMeanRevertingDiag } from './synth';
import pRetry from 'p-retry';
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
function normalizeRpcUrl(raw: string): string {
  let s = (raw || '').trim();
  if (!s) return s;
  if (!s.includes('://')) s = `http://${s}`;
  try {
    const u = new URL(s);
    const proto = u.protocol.toLowerCase();
    if (['http:', 'https:', 'ws:', 'wss:'].includes(proto) && !u.port) {
      u.port = '8545';
    }
    return u.toString().replace(/\/$/, '');
  } catch {
    return s;
  }
}

function makeProvider(url: string): ethers.Provider {
  return new ethers.JsonRpcProvider(url);
}

function assertHexAddress(addr: string, varName: string): string {
  if (!ethers.isAddress(addr)) {
    console.error(`${varName} が 0x プレフィックスのEVMアドレスではありません。ENS名は未対応です。`);
    console.error(`${varName}=${addr}`);
    process.exit(1);
  }
  if (addr.toLowerCase() === ethers.ZeroAddress.toLowerCase()) {
    console.error(`${varName} に zero address(0x000...000) は指定できません。正しいコントラクトアドレスを設定してください。`);
    process.exit(1);
  }
  return addr;
}

async function main() {
  const provider = makeProvider(CFG.rpcUrl);
  const wallet = new ethers.Wallet(CFG.privateKey, provider);
  const oracleAddr = assertHexAddress(CFG.oracleAddress, 'ORACLE_ADDRESS');
  const oracle = new ethers.Contract(oracleAddr, OracleAbi, wallet);

  // コード存在チェック（未デプロイ/EOA を早期検知）
  const code = await pRetry(() => provider.getCode(oracleAddr), {
    retries: CFG.retries,
    factor: 2,
    minTimeout: 200,
    maxTimeout: Math.max(500, CFG.requestTimeoutMs)
  });
  if (!code || code === '0x') {
    console.error('指定アドレスにコントラクトコードが存在しません。ORACLE_ADDRESS / ネットワークを確認してください。');
    console.error(`ORACLE_ADDRESS=${oracleAddr}`);
    console.error('デプロイ例: forge script script/DeployOracle.s.sol --broadcast --rpc-url <RPC> --private-key <PK>');
    process.exit(1);
  }

  // on-chain 値の取得（環境変数で上書き可）
  let onChainScale: bigint;
  let onChainHeartbeat: bigint;
  try {
    const [sc, hb] = await pRetry(
      () => Promise.all([oracle.priceScale(), oracle.heartbeat()]),
      {
        retries: CFG.retries,
        factor: 2,
        minTimeout: 200,
        maxTimeout: Math.max(500, CFG.requestTimeoutMs)
      }
    );
    onChainScale = BigInt(sc);
    onChainHeartbeat = BigInt(hb);
  } catch (e: any) {
    // ABI 不一致やプロキシ未初期化などで decode 失敗時の案内
    const codeStr = e?.code ?? '';
    const val = e?.value ?? '';
    if (codeStr === 'BAD_DATA' && val === '0x') {
      console.error('priceScale()/heartbeat() の呼び出しに失敗しました（decode=0x）。');
      console.error('ORACLE_ADDRESS が正しいコントラクトか、ネットワーク一致/ABI 一致かをご確認ください。');
      console.error('必要に応じて .env の SCALE/HEARTBEAT_SEC を明示設定して回避可能です。');
    }
    throw e;
  }

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

  let simulatedFailOnce = (process.env.SIMULATE_RPC_FAIL_ONCE ?? '').length > 0;
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

      // 1) 外部価格取得（複数ソース + 集計 + リトライ）→ アンカー
      let anchorBigInt: bigint | undefined;
      let anchorFrom: 'offchain' | 'fallback' = 'offchain';
      try {
        const offchain = await fetchAggregate(
          CFG.priceSourceUrls,
          CFG.requestTimeoutMs,
          CFG.retries,
          CFG.aggregation,
          CFG.priceJsonPath
        );
        anchorBigInt = roundToScale(offchain.toString(), scale);
      } catch (e) {
        console.warn('外部価格取得失敗。アンカーをオンチェーン/直近送信値にフォールバック:', e);
        anchorFrom = 'fallback';
      }

      // 現在のオンチェーン値（prev 候補）
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
        console.warn('オンチェーン情報取得失敗（継続）:', e);
      }

      const prev = current ?? lastSentPrice ?? (anchorBigInt ?? 0n);
      if (!anchorBigInt) {
        anchorBigInt = prev; // フォールバック時はアンカー=prev としてMRJ無効化相当
      }

      // 2) 合成（平均回帰付きジッター）
      let reportPrice: bigint;
      if (CFG.synth.enable && anchorFrom === 'offchain') {
        const chain = await provider.getNetwork().then((n) => Number(n.chainId)).catch(() => 0);
        const nowSec = Math.floor(Date.now() / 1000);
        const { next, diag } = computeMeanRevertingDiag(prev, anchorBigInt!, scale, CFG.synth, nowSec, chain);
        reportPrice = next;
        if ((CFG as any).debugSynth) {
          console.debug('[synth]', {
            prev: prev.toString(),
            anchor: anchorBigInt!.toString(),
            next: reportPrice.toString(),
            dev_bps: diag.devBps,
            p_up: diag.pUp.toFixed(4),
            step_bps: diag.stepBps.toFixed(3),
            dir: diag.dir,
            bucket: diag.bucket
          });
        }
      } else {
        reportPrice = anchorBigInt!;
      }

      // 2.5) 同値スキップ（任意）
      if (skipSame || CFG.priceChangeBps > 0) {
        if (lastSentPrice !== undefined && lastSentPrice === reportPrice) {
          console.log('同値（直近送信値）→ 送信スキップ:', reportPrice.toString());
          return;
        }
        if (current !== undefined) {
          if (current === reportPrice) {
            console.log('同値（オンチェーン）→ 送信スキップ:', reportPrice.toString());
            return;
          }
          if (CFG.priceChangeBps > 0) {
            const diff = reportPrice > current ? reportPrice - current : current - reportPrice;
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
        console.log(`DRY_RUN: pushPrice(${reportPrice.toString()}) ts=${now}`);
        lastSentPrice = reportPrice;
        return;
      }
      const rec = await pRetry(
        async () => {
          if (simulatedFailOnce) {
            simulatedFailOnce = false;
            throw new Error('SIMULATED_RPC_FAIL_ONCE');
          }
          const fee = await provider.getFeeData();
          const tx = await oracle.pushPrice(100n * 10n**18n, {
            maxFeePerGas: fee.maxFeePerGas ?? undefined,
            maxPriorityFeePerGas: fee.maxPriorityFeePerGas ?? undefined
          });
          const r = await tx.wait();
          return r;
        },
        {
          retries: CFG.retries,
          factor: 2,
          minTimeout: 200,
          maxTimeout: Math.max(500, CFG.requestTimeoutMs)
        }
      );

      const now = Math.floor(Date.now() / 1000);
      console.log(`pushed price=${reportPrice.toString()} ts=${now} tx=${rec?.hash}`);
      lastSentPrice = reportPrice;
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

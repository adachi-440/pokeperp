import 'dotenv/config';
import axios from 'axios';
import pRetry from 'p-retry';
import pTimeout from 'p-timeout';
import { z } from 'zod';
import { ethers } from 'ethers';

// -------------------------------
// Config schema & load
// -------------------------------
const EnvSchema = z.object({
  RPC_URL: z.string().min(1, 'RPC_URL is required'),
  PRIVATE_KEY: z.string().min(1, 'PRIVATE_KEY is required'),
  ORACLE_ADDRESS: z.string().min(1, 'ORACLE_ADDRESS is required'),
  PRICE_SOURCE_URL: z.string().url().optional(),
  SCALE: z.string().regex(/^\d+$/).optional(),
  HEARTBEAT_SEC: z.string().regex(/^\d+$/).optional(),
  PUSH_INTERVAL_MS: z.string().regex(/^\d+$/).optional()
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('環境変数エラー:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const ENV = parsed.data;

// -------------------------------
// Constants / ABI
// -------------------------------
const OracleAbi = [
  'function pushPrice(uint256 price) external',
  'function priceScale() external view returns (uint64)',
  'function heartbeat() external view returns (uint64)',
  'function lastUpdated() external view returns (uint64)'
];

// -------------------------------
// Utilities
// -------------------------------
function roundToScale(price: number, scale: bigint): bigint {
  return BigInt(Math.round(price * Number(scale)));
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

// -------------------------------
// Price fetcher
// -------------------------------
async function fetchPriceOnce(url: string, timeoutMs = 1500): Promise<number> {
  const resp = await pTimeout(axios.get(url), { milliseconds: timeoutMs });
  // 想定レスポンス: { price: number }
  const v = Number((resp.data as any)?.price);
  if (!Number.isFinite(v) || v <= 0) throw new Error('bad price from source');
  return v;
}

async function fetchPriceWithRetry(url: string): Promise<number> {
  return pRetry(() => fetchPriceOnce(url), {
    retries: 3,
    factor: 2,
    minTimeout: 250,
    maxTimeout: 1500,
    onFailedAttempt: (err) => {
      console.warn(`価格取得リトライ: ${err.attemptNumber}/${err.retriesLeft} 残り`);
    }
  });
}

// -------------------------------
// Main routine
// -------------------------------
async function main() {
  const provider = new ethers.JsonRpcProvider(ENV.RPC_URL);
  const wallet = new ethers.Wallet(ENV.PRIVATE_KEY, provider);
  const oracle = new ethers.Contract(ENV.ORACLE_ADDRESS, OracleAbi, wallet);

  // on-chain 値の取得（環境変数で上書き可）
  const onChainScale = BigInt(await oracle.priceScale());
  const onChainHeartbeat = BigInt(await oracle.heartbeat());

  const scale: bigint = ENV.SCALE ? BigInt(ENV.SCALE) : onChainScale;
  const heartbeatSec: bigint = ENV.HEARTBEAT_SEC ? BigInt(ENV.HEARTBEAT_SEC) : onChainHeartbeat;

  let pushIntervalMs: number = Number(ENV.PUSH_INTERVAL_MS ?? '3000');
  const hbMs = Number(heartbeatSec) * 1000;
  if (pushIntervalMs >= hbMs) {
    console.warn(`PUSH_INTERVAL_MS(${pushIntervalMs}) が HEARTBEAT(${hbMs}) 以上です。間隔を調整します。`);
    // heartbeat より少し短くする（200ms マージン）
    pushIntervalMs = Math.max(500, hbMs - 200);
  }

  console.log('--- Oracle Reporter 起動 ---');
  console.log('network:', await provider.getNetwork());
  console.log('reporter:', await wallet.getAddress());
  console.log('oracle  :', ENV.ORACLE_ADDRESS);
  console.log('scale   :', scale.toString());
  console.log('heartbeat(sec):', heartbeatSec.toString());
  console.log('interval(ms)  :', pushIntervalMs);

  const sourceUrl = ENV.PRICE_SOURCE_URL ?? 'https://example.com/price';
  console.log('price source  :', sourceUrl);

  let pushing = false;

  const pushOnce = async () => {
    if (pushing) {
      console.warn('前回の push が進行中のためスキップ');
      return;
    }
    pushing = true;
    try {
      // 1) 外部価格取得（リトライ付き）
      const offchain = await fetchPriceWithRetry(sourceUrl);
      // 2) 丸め（scale 単位）
      const onchain = roundToScale(offchain, scale);

      // 3) 送信（ガス設定）
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
    } catch (err) {
      console.error('push 失敗:', err);
    } finally {
      pushing = false;
    }
  };

  // 初回即時 push
  await pushOnce();
  // 定期 push
  const timer = setInterval(pushOnce, pushIntervalMs);

  // Graceful shutdown
  const shutdown = async (sig: string) => {
    console.log(`受信: ${sig}、シャットダウンします…`);
    clearInterval(timer);
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


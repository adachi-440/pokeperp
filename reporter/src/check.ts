import 'dotenv/config';
import { z } from 'zod';
import { ethers } from 'ethers';

const EnvSchema = z.object({
  RPC_URL: z.string().min(1),
  ORACLE_ADDRESS: z.string().min(1)
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('環境変数エラー:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const { RPC_URL, ORACLE_ADDRESS } = parsed.data as { RPC_URL: string; ORACLE_ADDRESS: string };

const OracleAbi = [
  'function priceScale() external view returns (uint64)',
  'function heartbeat() external view returns (uint64)',
  'function lastUpdated() external view returns (uint64)',
  'function indexPrice() external view returns (uint256)',
  'function markPrice() external view returns (uint256)'
];

function normalizeRpcUrl(raw: string): string {
  let s = (raw || '').trim();
  if (!s) return s;
  // プロトコルが無ければ http とみなす
  if (!s.includes('://')) s = `http://${s}`;
  try {
    const u = new URL(s);
    const proto = u.protocol.toLowerCase();
    const isRpcProto = ['http:', 'https:', 'ws:', 'wss:'].includes(proto);
    if (!isRpcProto) return s; // そのまま返す
    // ポート未指定なら 8545 を既定
    if (!u.port) {
      u.port = '8545';
    }
    // 末尾のスラッシュは省略（任意）
    const normalized = u.toString().replace(/\/$/, '');
    return normalized;
  } catch {
    // URL として解釈不能ならそのまま返す
    return s;
  }
}

function makeProvider(url: string): ethers.Provider {
  const normalized = normalizeRpcUrl(url);
  try {
    const lower = normalized.trim().toLowerCase();
    if (lower.startsWith('ws://') || lower.startsWith('wss://')) {
      // WebSocket の場合
      return new ethers.WebSocketProvider(normalized);
    }
    return new ethers.JsonRpcProvider(normalized);
  } catch (e) {
    throw new Error(`RPC_URL が不正です: ${normalized}`);
  }
}

async function main() {
  const provider = makeProvider(RPC_URL);
  if (!ethers.isAddress(ORACLE_ADDRESS)) {
    console.error('ORACLE_ADDRESS が 0x プレフィックスのEVMアドレスではありません。ENS名は未対応です。');
    console.error(`ORACLE_ADDRESS=${ORACLE_ADDRESS}`);
    process.exit(1);
  }
  let net: any;
  try {
    net = await provider.getNetwork();
  } catch (e: any) {
    // ethers v6 の bodyJson 失敗を判別し、わかりやすい説明を出す
    const code = e?.code ?? '';
    const op = e?.operation ?? '';
    if (code === 'UNSUPPORTED_OPERATION' && op === 'bodyJson') {
      console.error('RPC 応答が JSON ではありません。RPC_URL が JSON-RPC エンドポイントか確認してください。');
      console.error(`RPC_URL(入力)=${RPC_URL}`);
      console.error('例: Anvil ローカルなら http://127.0.0.1:8545');
    }
    // 接続拒否（ノード未起動 or ポート誤り）を検出
    const codes = new Set<string>();
    const pushCode = (c: any) => {
      if (typeof c === 'string' && c) codes.add(c);
    };
    pushCode(e?.code);
    // AggregateError 形式（複数アドレス試行）
    if (Array.isArray(e?.errors)) {
      for (const er of e.errors) pushCode(er?.code);
    }
    if (codes.has('ECONNREFUSED')) {
      console.error('RPC に接続できません（ECONNREFUSED）。ノードが起動しているか、ポートが正しいか確認してください。');
      console.error(`RPC_URL(入力)=${RPC_URL}`);
      console.error('例: ローカルで anvil を起動: anvil -p 8545');
      console.error('     環境変数: RPC_URL=http://127.0.0.1:8545');
      process.exit(1);
    }
    throw e;
  }
  const oracle = new ethers.Contract(ORACLE_ADDRESS, OracleAbi, provider);

  // コード存在チェック（未デプロイ/EOA を早期検知）
  const code = await provider.getCode(ORACLE_ADDRESS);
  if (!code || code === '0x') {
    console.error('指定アドレスにコントラクトコードが存在しません。ORACLE_ADDRESS を確認してください。');
    console.error(`ORACLE_ADDRESS=${ORACLE_ADDRESS}`);
    console.error('デプロイ例: forge script script/DeployOracle.s.sol --broadcast --rpc-url <RPC> --private-key <PK>');
    process.exit(1);
  }

  const [scale, hb, lu, idx, mrk] = await Promise.all([
    oracle.priceScale(),
    oracle.heartbeat(),
    oracle.lastUpdated(),
    oracle.indexPrice(),
    oracle.markPrice()
  ]);

  const luNum = Number(lu);
  const hbNum = Number(hb);
  const nowSec = Math.floor(Date.now() / 1000);
  const age = nowSec - luNum;

  console.log('network      :', net);
  console.log('oracle       :', ORACLE_ADDRESS);
  console.log('priceScale   :', scale.toString());
  console.log('heartbeat(s) :', hb.toString());
  console.log('lastUpdated  :', lu.toString(), `(age=${age}s, ${new Date(luNum * 1000).toISOString()})`);
  console.log('indexPrice   :', idx.toString());
  console.log('markPrice    :', mrk.toString());
  console.log('fresh?       :', age <= hbNum);
}

main().catch((e: any) => {
  const code = e?.code ?? '';
  const op = e?.operation ?? '';
  if (code === 'UNSUPPORTED_OPERATION' && op === 'bodyJson') {
    // 既に分かりやすい説明を出しているのでスタックトレースは抑止
    process.exit(1);
  }
  console.error(e);
  process.exit(1);
});

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

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const net = await provider.getNetwork();
  const oracle = new ethers.Contract(ORACLE_ADDRESS, OracleAbi, provider);

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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


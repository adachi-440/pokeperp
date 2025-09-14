import 'dotenv/config';
import { z } from 'zod';
import { ethers } from 'ethers';

const EnvSchema = z.object({
  RPC_URL: z.string().min(1),
  PRIVATE_KEY: z.string().min(1), // オーナー鍵を想定
  ORACLE_ADDRESS: z.string().min(1)
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('環境変数エラー:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const { RPC_URL, PRIVATE_KEY, ORACLE_ADDRESS } = parsed.data as {
  RPC_URL: string;
  PRIVATE_KEY: string;
  ORACLE_ADDRESS: string;
};

const OracleAbi = [
  'function setReporter(address reporter) external',
  'function setHeartbeat(uint64 heartbeatSec) external',
  'function pause(bool p) external',
  'function reporter() external view returns (address)',
  'function heartbeat() external view returns (uint64)',
  'function priceScale() external view returns (uint64)',
  'function lastUpdated() external view returns (uint64)',
  'function indexPrice() external view returns (uint256)'
];

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const oracle = new ethers.Contract(ORACLE_ADDRESS, OracleAbi, wallet);

  switch (cmd) {
    case 'get': {
      const [rep, hb, sc, lu, idx] = await Promise.all([
        oracle.reporter(),
        oracle.heartbeat(),
        oracle.priceScale(),
        oracle.lastUpdated(),
        oracle.indexPrice()
      ]);
      console.log({
        reporter: rep,
        heartbeatSec: hb.toString(),
        priceScale: sc.toString(),
        lastUpdated: lu.toString(),
        indexPrice: idx.toString()
      });
      break;
    }
    case 'set-reporter': {
      if (!arg) throw new Error('usage: admin set-reporter <address>');
      const tx = await oracle.setReporter(arg);
      const rec = await tx.wait();
      console.log('setReporter tx:', rec?.hash);
      break;
    }
    case 'set-heartbeat': {
      if (!arg || !/^\d+$/.test(arg)) throw new Error('usage: admin set-heartbeat <sec>');
      const hb = BigInt(arg);
      const tx = await oracle.setHeartbeat(hb);
      const rec = await tx.wait();
      console.log('setHeartbeat tx:', rec?.hash);
      break;
    }
    case 'pause': {
      if (!arg || !/^(true|false)$/i.test(arg)) throw new Error('usage: admin pause <true|false>');
      const p = arg.toLowerCase() === 'true';
      const tx = await oracle.pause(p);
      const rec = await tx.wait();
      console.log('pause tx:', rec?.hash);
      break;
    }
    default: {
      console.log('Usage:');
      console.log('  npm run admin -- get');
      console.log('  npm run admin -- set-reporter <address>');
      console.log('  npm run admin -- set-heartbeat <sec>');
      console.log('  npm run admin -- pause <true|false>');
      process.exit(1);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


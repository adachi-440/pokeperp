import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import { ethers } from 'ethers';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const MNEMONIC = 'test test test test test test test test test test test junk';

function delay(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function waitForOutput(cp: ChildProcessWithoutNullStreams, rx: RegExp, timeoutMs = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    const onData = (b: Buffer) => {
      const s = b.toString('utf8');
      chunks.push(s);
      if (rx.test(chunks.join(''))) {
        cleanup();
        resolve(chunks.join(''));
      }
    };
    const onErr = (b: Buffer) => { onData(b); };
    const onExit = (code: number | null) => {
      cleanup();
      reject(new Error(`process exited: ${code}\n${chunks.join('')}`));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout waiting for ${rx}`));
    }, timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      cp.stdout.off('data', onData);
      cp.stderr.off('data', onErr);
      cp.off('exit', onExit);
    }
    cp.stdout.on('data', onData);
    cp.stderr.on('data', onErr);
    cp.on('exit', onExit);
  });
}

function startAnvil(port: number, blockTimeSec = 3) {
  const cp = spawn('anvil', ['--port', String(port), '--block-time', String(blockTimeSec), '--mnemonic', MNEMONIC, '--silent']);
  return cp;
}

function startPriceServer(port: number, base = 3000) {
  let price = base;
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url?.startsWith('/price')) {
      const body = JSON.stringify({ price });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(body);
      return;
    }
    res.writeHead(404); res.end();
  });
  return new Promise<http.Server>((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function hereDir() {
  return path.dirname(new URL(import.meta.url).pathname);
}

async function deployOracle(provider: ethers.JsonRpcProvider, wallet: ethers.Wallet, reporterAddr: string, scale: bigint, hb: bigint) {
  const artifactPath = path.resolve(hereDir(), '../../contract/out/OracleAdapterSimple.sol/OracleAdapterSimple.json');
  const json = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  const factory = new ethers.ContractFactory(json.abi, json.bytecode.object, wallet);
  const c = await factory.deploy(reporterAddr, scale, hb);
  await c.waitForDeployment();
  return new ethers.Contract(await c.getAddress(), json.abi, wallet);
}

describe('Reporter integration (local chain)', () => {
  const RPC_PORT = 18545; // avoid default
  const PRICE_PORT = 18787;
  let anvil: ChildProcessWithoutNullStreams;
  let provider: ethers.JsonRpcProvider;
  let wallet: ethers.Wallet;
  let oracle: ethers.Contract;
  let priceServer: http.Server;

  beforeAll(async () => {
    anvil = startAnvil(RPC_PORT, 3);
    // wait for RPC ready by polling chainId
    const url = `http://127.0.0.1:${RPC_PORT}`;
    provider = new ethers.JsonRpcProvider(url);
    const start = Date.now();
    while (true) {
      try { await provider.getBlockNumber(); break; } catch {}
      if (Date.now() - start > 10000) throw new Error('anvil start timeout');
      await delay(100);
    }
    wallet = ethers.Wallet.fromPhrase(MNEMONIC).connect(provider);
    priceServer = await startPriceServer(PRICE_PORT, 3000);
    const reporterAddr = await wallet.getAddress();
    oracle = await deployOracle(provider, wallet, reporterAddr, 10n ** 18n, 5n);
  }, 30000);

  afterAll(async () => {
    try { priceServer?.close(); } catch {}
    if (anvil && !anvil.killed) anvil.kill('SIGKILL');
  });

  it('pushes to OracleAdapterSimple and receives PricePushed; isFresh behavior; no duplicates under delay; recovers from transient RPC failure', async () => {
    const fromBlock = await provider.getBlockNumber();
    // start reporter
    const env = {
      ...process.env,
      RPC_URL: `http://127.0.0.1:${RPC_PORT}`,
      PRIVATE_KEY: wallet.privateKey,
      ORACLE_ADDRESS: await oracle.getAddress(),
      PRICE_SOURCE_URL: `http://127.0.0.1:${PRICE_PORT}/price`,
      PUSH_INTERVAL_MS: '1000',
      JITTER_PCT: '0',
      RETRIES: '2',
      REQUEST_TIMEOUT_MS: '1000'
    } as any;
    const reporter = spawn('node', ['--import', 'tsx', path.resolve(hereDir(), '../src/index.ts')], {
      cwd: path.resolve(hereDir(), '..'),
      env
    });

    // wait for at least one push log to ensure reporter started
    await waitForOutput(reporter, /pushed price=/, 20000);

    // wait until we have at least 2 events, then assert they are not in the same block
    let logs1 = await oracle.queryFilter(oracle.filters.PricePushed(), fromBlock);
    const t0 = Date.now();
    while (logs1.length < 2 && Date.now() - t0 < 25000) {
      await delay(1000);
      logs1 = await oracle.queryFilter(oracle.filters.PricePushed(), fromBlock);
    }
    expect(logs1.length).toBeGreaterThanOrEqual(2);
    const bns = logs1.slice(0, 2).map((l) => l.blockNumber);
    expect(bns[0]).not.toEqual(bns[1]);

    // isFresh stays true while reporter running with interval < heartbeat
    expect(await oracle.isFresh()).toBe(true);

    // stop reporter and wait > heartbeat
    reporter.kill('SIGTERM');
    await delay(6000);
    expect(await oracle.isFresh()).toBe(false);

    // restart reporter with simulated one-time RPC failure; should recover and push
    const from2 = await provider.getBlockNumber();
    const reporter2 = spawn('node', ['--import', 'tsx', path.resolve(hereDir(), '../src/index.ts')], {
      cwd: path.resolve(hereDir(), '..'),
      env: { ...env, SIMULATE_RPC_FAIL_ONCE: '1' }
    });
    await waitForOutput(reporter2, /pushed price=/, 20000);
    const logs2 = await oracle.queryFilter(oracle.filters.PricePushed(), from2);
    expect(logs2.length).toBeGreaterThanOrEqual(1);
    reporter2.kill('SIGTERM');
  }, 60000);
});

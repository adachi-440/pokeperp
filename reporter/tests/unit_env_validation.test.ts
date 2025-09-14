import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config';

function baseEnv(): NodeJS.ProcessEnv {
  return {
    RPC_URL: 'http://127.0.0.1:8545',
    PRIVATE_KEY: '0x59c6995e998f97a5a0044966f094538257f0ea5f3a5c6f0f21b1a1a1a1a1a1a1',
    ORACLE_ADDRESS: '0x0000000000000000000000000000000000000001'
  } as any;
}

describe('Env validation (required/optional)', () => {
  it('throws when required fields missing', () => {
    expect(() => loadConfig({} as any)).toThrow();
    expect(() => loadConfig({ RPC_URL: 'http://x' } as any)).toThrow();
  });

  it('parses minimal valid env and fills defaults', () => {
    const cfg = loadConfig(baseEnv());
    expect(cfg.rpcUrl).toContain('127.0.0.1');
    expect(cfg.priceSourceUrls.length).toBe(1);
    expect(cfg.priceSourceUrls[0]).toBe('https://example.com/price');
    expect(cfg.priceJsonPath).toBe('price');
  });

  it('accepts single URL or comma-separated URLs', () => {
    const e1 = { ...baseEnv(), PRICE_SOURCE_URL: 'https://a.example/price' } as any;
    const c1 = loadConfig(e1);
    expect(c1.priceSourceUrls).toEqual(['https://a.example/price']);

    const e2 = { ...baseEnv(), PRICE_SOURCE_URLS: 'https://a.example/p, https://b.example/q' } as any;
    const c2 = loadConfig(e2);
    expect(c2.priceSourceUrls).toEqual(['https://a.example/p', 'https://b.example/q']);
  });

  it('parses overrides and numeric fields', () => {
    const e = {
      ...baseEnv(),
      SCALE: '1000000',
      HEARTBEAT_SEC: '5',
      PUSH_INTERVAL_MS: '1000',
      JITTER_PCT: '0.2',
      REQUEST_TIMEOUT_MS: '1200',
      RETRIES: '2',
      PRICE_CHANGE_BPS: '10',
      SKIP_SAME_PRICE: 'true',
      DRY_RUN: '1',
      AGGREGATION: 'median'
    } as any;
    const cfg = loadConfig(e);
    expect(cfg.overrideScale).toBe(1000000n);
    expect(cfg.overrideHeartbeatSec).toBe(5n);
    expect(cfg.pushIntervalMs).toBe(1000);
    expect(cfg.jitterPct).toBe(0.2);
    expect(cfg.requestTimeoutMs).toBe(1200);
    expect(cfg.retries).toBe(2);
    expect(cfg.priceChangeBps).toBe(10);
    expect(cfg.skipSame).toBe(true);
    expect(cfg.dryRun).toBe(true);
    expect(cfg.aggregation).toBe('median');
  });
});


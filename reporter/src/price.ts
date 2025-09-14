import axios from 'axios';
import pRetry from 'p-retry';
import { median, mean, trimmedMean } from './util';

export type Aggregation = 'median' | 'mean' | 'trimmed-mean';

function getByPath(obj: any, path: string): any {
  if (!path) return obj;
  return path.split('.').reduce((acc: any, key) => (acc == null ? undefined : acc[key]), obj);
}

export async function fetchPriceOnce(url: string, timeoutMs: number, jsonPath: string): Promise<number> {
  const resp = await axios.get(url, { timeout: timeoutMs });
  const raw = getByPath(resp.data, jsonPath);
  const v = Number(raw);
  if (!Number.isFinite(v) || v <= 0) throw new Error('bad price from source');
  return v;
}

export async function fetchPriceWithRetry(url: string, timeoutMs: number, retries: number, jsonPath: string): Promise<number> {
  return pRetry(() => fetchPriceOnce(url, timeoutMs, jsonPath), {
    retries,
    factor: 2,
    minTimeout: 250,
    maxTimeout: Math.max(250, timeoutMs),
    onFailedAttempt: (err) => {
      console.warn(`価格取得リトライ: ${err.attemptNumber}/${err.retriesLeft} 残り (${url})`);
    }
  });
}

export async function fetchAggregate(urls: string[], timeoutMs: number, retries: number, mode: Aggregation, jsonPath: string): Promise<number> {
  if (urls.length === 0) throw new Error('no price source urls');
  // 並列にフェッチ、成功分を集計
  const results = await Promise.allSettled(urls.map((u) => fetchPriceWithRetry(u, timeoutMs, retries, jsonPath)));
  const vals: number[] = [];
  const errs: any[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') vals.push(r.value);
    else errs.push(r.reason);
  }
  if (vals.length === 0) {
    throw new Error(`価格取得失敗: ${errs.map(String).slice(0, 2).join(' | ')}`);
  }
  switch (mode) {
    case 'median':
      return median(vals);
    case 'mean':
      return mean(vals);
    case 'trimmed-mean':
      return trimmedMean(vals, 0.1);
  }
}

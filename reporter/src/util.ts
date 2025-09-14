import Big from 'big.js';

// price を Number で扱わず、decimal ベースで floor 丸めして整数化
export function roundToScale(price: number | string, scale: bigint): bigint {
  const x = new Big(typeof price === 'string' ? price : price.toString());
  const s = new Big(scale.toString());
  // 0 小数位まで、roundDown=常に切り捨て（floor）
  return BigInt(x.times(s).round(0, Big.roundDown).toFixed(0));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

// Big ベースの統計関数（IEEE754 誤差を回避）
export function bigMedian(xs: Big[]): Big {
  if (xs.length === 0) throw new Error('median: empty');
  const a = [...xs].sort((x, y) => x.cmp(y));
  const mid = Math.floor(a.length / 2);
  if (a.length % 2 === 0) {
    return a[mid - 1].plus(a[mid]).div(2);
  }
  return a[mid];
}

export function bigMean(xs: Big[]): Big {
  if (xs.length === 0) throw new Error('mean: empty');
  let sum = new Big(0);
  for (const v of xs) sum = sum.plus(v);
  return sum.div(xs.length);
}

export function bigTrimmedMean(xs: Big[], trimRatio = 0.1): Big {
  if (xs.length === 0) throw new Error('trimmedMean: empty');
  const a = [...xs].sort((x, y) => x.cmp(y));
  const n = a.length;
  const k = Math.floor(n * Math.min(0.25, Math.max(0, trimRatio))); // 安全上限
  const sliced = a.slice(k, n - k);
  return bigMean(sliced.length ? sliced : a);
}

export function jitteredDelayMs(baseMs: number, jitterPct: number): number {
  if (jitterPct <= 0) return baseMs;
  const jitter = baseMs * jitterPct;
  const delta = (Math.random() * 2 - 1) * jitter; // [-jitter, +jitter]
  return Math.max(1, Math.floor(baseMs + delta));
}

export function roundToScale(price: number, scale: bigint): bigint {
  return BigInt(Math.round(price * Number(scale)));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

export function median(xs: number[]): number {
  if (xs.length === 0) throw new Error('median: empty');
  const a = [...xs].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  if (a.length % 2 === 0) return (a[mid - 1] + a[mid]) / 2;
  return a[mid];
}

export function mean(xs: number[]): number {
  if (xs.length === 0) throw new Error('mean: empty');
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

export function trimmedMean(xs: number[], trimRatio = 0.1): number {
  if (xs.length === 0) throw new Error('trimmedMean: empty');
  const a = [...xs].sort((x, y) => x - y);
  const n = a.length;
  const k = Math.floor(n * Math.min(0.25, Math.max(0, trimRatio))); // 安全上限
  const sliced = a.slice(k, n - k);
  return mean(sliced.length ? sliced : a);
}

export function jitteredDelayMs(baseMs: number, jitterPct: number): number {
  if (jitterPct <= 0) return baseMs;
  const jitter = baseMs * jitterPct;
  const delta = (Math.random() * 2 - 1) * jitter; // [-jitter, +jitter]
  return Math.max(1, Math.floor(baseMs + delta));
}


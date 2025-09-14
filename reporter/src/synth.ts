// synth.ts — Mean-Reverting Jitter around daily anchor
import { keccak256, solidityPacked } from 'ethers';
import Big from 'big.js';

export type SynthCfg = {
  enable: boolean;
  baseStepBps: number;       // e.g., 3 (=0.03%)
  stepJitterPct: number;     // e.g., 0.5 → ±50%
  skewMax: number;           // e.g., 0.06 → ±6pp
  bandBps: number;           // e.g., 150 (=1.5%)
  reversionBoost: number;    // e.g., 1.0
  clampDevBps: number;       // e.g., 300 (=3%)
  overshootProb: number;     // e.g., 0.02
  bucketSec: number;         // e.g., 300
  salt?: string;
};

export type SynthDiag = {
  devBps: number;
  pUp: number;
  stepBps: number;
  dir: 1 | -1;
  bucket: number;
};

export function computeMeanRevertingNext(
  prev: bigint,
  anchor: bigint,
  scale: bigint,
  cfg: SynthCfg,
  nowSec: number,
  chainId: number | undefined
): bigint {
  return computeMeanRevertingDiag(prev, anchor, scale, cfg, nowSec, chainId).next;
}

export function computeMeanRevertingDiag(
  prev: bigint,
  anchor: bigint,
  scale: bigint,
  cfg: SynthCfg,
  nowSec: number,
  chainId: number | undefined
): { next: bigint; diag: SynthDiag } {
  if (!cfg.enable) return { next: anchor, diag: { devBps: 0, pUp: 0.5, stepBps: 0, dir: 1, bucket: 0 } };

  const s = Number(scale);
  const prevF = Number(prev) / s;
  const anchorF = Number(anchor) / s;
  if (!Number.isFinite(prevF) || !Number.isFinite(anchorF) || anchorF <= 0) {
    return { next: anchor, diag: { devBps: 0, pUp: 0.5, stepBps: 0, dir: 1, bucket: 0 } };
  }

  const dev = (anchorF - prevF) / anchorF;
  const band = (cfg.bandBps || 1) / 1e4;
  const devNorm = band > 0 ? dev / band : dev;
  const clampAbs = (cfg.clampDevBps || 99999) / 1e4;

  // time bucket for stable jitter within a short window
  const bucket = Math.floor(nowSec / Math.max(1, cfg.bucketSec || 60));

  // PRNG → two uniforms in [0,1)
  const seed = keccak256(
    solidityPacked(
      ['uint256', 'uint256', 'int256', 'string', 'uint256'],
      [anchor, prev, BigInt(bucket * 1_000_000 + Math.round(dev * 1e6)), cfg.salt || '', BigInt(chainId || 0)]
    )
  );
  const u1 = parseInt(seed.slice(2, 10), 16) / 0xffffffff;
  const u2 = parseInt(seed.slice(10, 18), 16) / 0xffffffff;

  // Direction tilt toward anchor
  const pUp = 0.5 + (cfg.skewMax || 0) * Math.tanh(Math.max(-4, Math.min(4, devNorm)));
  const dir: 1 | -1 = u1 < pUp ? 1 : -1;

  // Step size (bps)
  const jitter = 1 + (cfg.stepJitterPct || 0) * (2 * u2 - 1);
  const boost = 1 + (cfg.reversionBoost || 0) * Math.min(1, Math.abs(dev) / Math.max(band, 1e-9));
  const stepBps = Math.max(0.1, cfg.baseStepBps || 1) * Math.max(0.1, jitter) * boost;

  let nextF = prevF * (1 + (dir * stepBps) / 1e4);

  // Soft clamp around anchor
  const devNext = (nextF - anchorF) / anchorF;
  if (Math.abs(devNext) > clampAbs) {
    const keep = (cfg.overshootProb || 0) > 0 && u1 > 1 - (cfg.overshootProb || 0);
    if (!keep) nextF = anchorF * (1 + Math.sign(devNext) * clampAbs);
  }

  // Limit overshoot when crossing anchor: max 20% of band beyond anchor
  if ((prevF - anchorF) * (nextF - anchorF) < 0) {
    const maxOver = 0.2 * band;
    const over = nextF - anchorF;
    if (Math.abs(over) > maxOver) nextF = anchorF + Math.sign(over) * maxOver;
  }

  // Quantize (floor)
  const q = Big(nextF).times(s).round(0, 0 /* RoundDown */).toNumber();
  const next = BigInt(Math.max(0, q));
  const diag: SynthDiag = { devBps: Math.round(dev * 1e4), pUp, stepBps, dir, bucket };
  return { next, diag };
}


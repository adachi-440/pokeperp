import { z } from 'zod';

const BoolLike = z
  .string()
  .optional()
  .transform((v) => (v ? ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()) : false));

export const EnvSchema = z.object({
  RPC_URL: z.string().min(1, 'RPC_URL is required'),
  PRIVATE_KEY: z.string().min(1, 'PRIVATE_KEY is required'),
  ORACLE_ADDRESS: z.string().min(1, 'ORACLE_ADDRESS is required'),

  // 単一 or 複数URL
  PRICE_SOURCE_URL: z.string().url().optional(),
  PRICE_SOURCE_URLS: z.string().optional(), // comma separated
  PRICE_JSON_PATH: z.string().optional(), // dot path (default: price)

  // オプション
  SCALE: z.string().regex(/^\d+$/).optional(),
  HEARTBEAT_SEC: z.string().regex(/^\d+$/).optional(),
  PUSH_INTERVAL_MS: z.string().regex(/^\d+$/).optional(),
  JITTER_PCT: z.string().regex(/^\d*(?:\.\d+)?$/).optional(),
  REQUEST_TIMEOUT_MS: z.string().regex(/^\d+$/).optional(),
  RETRIES: z.string().regex(/^\d+$/).optional(),
  PRICE_CHANGE_BPS: z.string().regex(/^\d+$/).optional(),
  SKIP_SAME_PRICE: z.string().optional(),
  DRY_RUN: z.string().optional(),
  AGGREGATION: z.enum(['median', 'mean', 'trimmed-mean']).optional(),

  // synth (mean-reverting jitter)
  SYNTH_ENABLE: z.string().optional(),
  SYNTH_BASE_STEP_BPS: z.string().regex(/^\d+(?:\.\d+)?$/).optional(),
  SYNTH_STEP_JITTER_PCT: z.string().regex(/^\d*(?:\.\d+)?$/).optional(),
  SYNTH_SKEW_MAX: z.string().regex(/^\d*(?:\.\d+)?$/).optional(),
  SYNTH_BAND_BPS: z.string().regex(/^\d+$/).optional(),
  SYNTH_REVERSION_BOOST: z.string().regex(/^\d*(?:\.\d+)?$/).optional(),
  SYNTH_CLAMP_DEV_BPS: z.string().regex(/^\d+$/).optional(),
  SYNTH_OVERSHOOT_PROB: z.string().regex(/^\d*(?:\.\d+)?$/).optional(),
  SYNTH_BUCKET_SEC: z.string().regex(/^\d+$/).optional(),
  SYNTH_SALT: z.string().optional(),
  DEBUG_SYNTH: z.string().optional()
});

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv) {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw parsed.error;
  }

  const e = parsed.data;
  const urls: string[] = e.PRICE_SOURCE_URLS
    ? e.PRICE_SOURCE_URLS.split(',').map((s) => s.trim()).filter(Boolean)
    : e.PRICE_SOURCE_URL
    ? [e.PRICE_SOURCE_URL]
    : ['https://example.com/price'];

  const cfg = {
    rpcUrl: e.RPC_URL,
    privateKey: e.PRIVATE_KEY,
    oracleAddress: e.ORACLE_ADDRESS,
    priceSourceUrls: urls,
    priceJsonPath: e.PRICE_JSON_PATH || 'price',

    overrideScale: e.SCALE ? BigInt(e.SCALE) : undefined,
    overrideHeartbeatSec: e.HEARTBEAT_SEC ? BigInt(e.HEARTBEAT_SEC) : undefined,
    pushIntervalMs: Number(e.PUSH_INTERVAL_MS ?? '3000'),
    jitterPct: Math.min(0.5, Math.max(0, Number(e.JITTER_PCT ?? '0.1'))),
    requestTimeoutMs: Number(e.REQUEST_TIMEOUT_MS ?? '1500'),
    retries: Number(e.RETRIES ?? '3'),
    priceChangeBps: Number(e.PRICE_CHANGE_BPS ?? '0'), // 0 なら無効
    skipSame: ['1', 'true', 'yes', 'on'].includes((e.SKIP_SAME_PRICE ?? '').toLowerCase()),
    dryRun: ['1', 'true', 'yes', 'on'].includes((e.DRY_RUN ?? '').toLowerCase()),
    aggregation: e.AGGREGATION ?? 'median',

    synth: {
      enable: ['1', 'true', 'yes', 'on'].includes((e.SYNTH_ENABLE ?? 'false').toLowerCase()),
      baseStepBps: Number(e.SYNTH_BASE_STEP_BPS ?? '3'),
      stepJitterPct: Number(e.SYNTH_STEP_JITTER_PCT ?? '0.5'),
      skewMax: Number(e.SYNTH_SKEW_MAX ?? '0.06'),
      bandBps: Number(e.SYNTH_BAND_BPS ?? '150'),
      reversionBoost: Number(e.SYNTH_REVERSION_BOOST ?? '1.0'),
      clampDevBps: Number(e.SYNTH_CLAMP_DEV_BPS ?? '300'),
      overshootProb: Number(e.SYNTH_OVERSHOOT_PROB ?? '0.02'),
      bucketSec: Number(e.SYNTH_BUCKET_SEC ?? '300'),
      salt: e.SYNTH_SALT || ''
    },
    debugSynth: ['1', 'true', 'yes', 'on'].includes((e.DEBUG_SYNTH ?? '').toLowerCase())
  } as const;

  return cfg;
}

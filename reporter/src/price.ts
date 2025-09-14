import axios from 'axios';
import pRetry from 'p-retry';
import Big from 'big.js';
import { bigMedian, bigMean, bigTrimmedMean } from './util';
import { fileURLToPath } from 'url';

export type Aggregation = 'median' | 'mean' | 'trimmed-mean';

// --- pokeca-chart 用の型とヘルパ ---
type IndexKind = 'psa10' | 'mipin'; // mipin = 美品
type SeriesPoint = { date: string | number; value: number };
// 代表的なペイロード型（完全一致は要求しない）
interface SeriesItem { name?: string; data?: unknown[] }
interface ChartPayloadA { labels?: unknown[]; series?: SeriesItem[] }
interface ChartPayloadB { dates?: unknown[]; psa10?: unknown[]; PSA10?: unknown[]; mipin?: unknown[]; 美品?: unknown[]; beauty?: unknown[] }

function getByPath(obj: any, path: string): any {
  if (!path) return obj;
  return path.split('.').reduce((acc: any, key) => (acc == null ? undefined : acc[key]), obj);
}

export async function fetchPriceOnce(url: string, timeoutMs: number, jsonPath: string): Promise<Big> {
  // 特殊ケース: pokeca-chart の指数ページ
  if (/pokeca-chart\.com\/chart-index\/?/.test(url)) {
    const kind = normalizeKindFromPath(jsonPath);
    // まず Playwright（あれば）でネットワーク JSON を横取り → フォールバックで HTML 解析
    try {
      const r = await scrapePokecaOnce(kind, url, timeoutMs);
      const last = r.series[r.series.length - 1];
      const v = new Big(String(last.value));
      if (!v.gt(0)) throw new Error('pokeca last<=0');
      return v;
    } catch (ePlay) {
      // フォールバック: HTML 内 <script> から series/labels を抽出
      const r2 = await scrapePokecaInline(kind, url, timeoutMs);
      const last = r2.series[r2.series.length - 1];
      const v = new Big(String(last.value));
      if (!v.gt(0)) throw new Error('pokeca(last)<=0');
      return v;
    }
  }

  // 通常の JSON API
  const resp = await axios.get(url, { timeout: timeoutMs });
  // 配列レスポンスなら末尾要素に対して path を適用（指数キャッシュAPI対応）
  const base = Array.isArray(resp.data) && resp.data.length > 0 ? resp.data[resp.data.length - 1] : resp.data;
  const raw = getByPath(base, jsonPath);
  // number でも string でも受け入れ、Big で厳密に扱う
  const v = new Big(typeof raw === 'string' ? raw : String(raw));
  if (!v.gt(0)) throw new Error('bad price from source');
  return v;
}

export async function fetchPriceWithRetry(url: string, timeoutMs: number, retries: number, jsonPath: string): Promise<Big> {
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

export async function fetchAggregate(urls: string[], timeoutMs: number, retries: number, mode: Aggregation, jsonPath: string): Promise<Big> {
  if (urls.length === 0) throw new Error('no price source urls');
  // 並列にフェッチ、成功分を集計
  const results = await Promise.allSettled(urls.map((u) => fetchPriceWithRetry(u, timeoutMs, retries, jsonPath)));
  const vals: Big[] = [];
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
      return bigMedian(vals);
    case 'mean':
      return bigMean(vals);
    case 'trimmed-mean':
      return bigTrimmedMean(vals, 0.1);
  }
}

// --- ここから pokeca-chart スクレイピング実装 ---

function normalizeKindFromPath(path: string): IndexKind {
  const p = (path || '').toLowerCase();
  if (p.includes('mipin') || p.includes('beauty') || p.includes('美')) return 'mipin';
  return 'psa10';
}

async function scrapePokecaOnce(kind: IndexKind, pageUrl: string, timeoutMs = 45000): Promise<{ label: string; series: SeriesPoint[]; sourceUrl: string }> {
  // 動的 import（依存が無い環境でも動くように）
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let chromium: typeof import('playwright').chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch (e) {
    throw new Error('playwright 未導入、もしくは読み込み失敗');
  }

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  try {
    const page = await browser.newPage({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
    });

    const payloads: Array<{ url: string; body: any }> = [];
    page.on('response', async (resp) => {
      try {
        const txt = await resp.text();
        try {
          payloads.push({ url: resp.url(), body: JSON.parse(txt) });
        } catch {
          // JSON でなければ無視
        }
      } catch (e) {
        // デバッグ用途に軽量ログ
        try { console.debug('resp.text() failed, skip', { url: resp.url() }); } catch {}
      }
    });

    await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: timeoutMs });
    // ネットワーク到達性かチャートDOMの出現を待つ（固定待機は避ける）
    try {
      await Promise.race([
        page.waitForResponse((r) => r.url().includes('get-index-chart-data.php') && r.status() === 200, { timeout: 3000 }),
        page.waitForSelector('div.chart_div, [id^="chartDiv_index"]', { timeout: 3000 })
      ]);
    } catch {}

    const pickSeries = (url: string, candidate: unknown): { label: string; series: SeriesPoint[] } | null => {
      // A) { labels: [...], series: [{name:'PSA10', data:[...]}, {name:'美品', data:[...]}] }
      const cA = candidate as ChartPayloadA;
      if (cA && Array.isArray(cA.series) && cA.labels) {
        const s = cA.series.find((it: SeriesItem) => {
          const name = String(it?.name ?? '').toLowerCase();
          return kind === 'psa10' ? name.includes('psa10') : name.includes('美') || name.includes('mipin');
        });
        if (s && Array.isArray(s.data) && Array.isArray(cA.labels) && s.data.length === cA.labels.length) {
          return {
            label: s.name || (kind === 'psa10' ? 'PSA10' : '美品'),
            series: cA.labels.map((d: unknown, i: number) => ({ date: d as any, value: Number((s.data as any[])[i]) })),
          };
        }
      }
      // B) { dates:[...], psa10:[...], mipin:[...] } もしくは { dates:[...], PSA10:[...], 美品:[...] }
      const cB = candidate as ChartPayloadB;
      if (cB && Array.isArray(cB.dates)) {
        const arr = kind === 'psa10' ? (cB.psa10 || (cB as any).PSA10) : (cB.mipin || (cB as any)['美品'] || (cB as any).beauty);
        if (Array.isArray(arr) && arr.length === cB.dates.length) {
          return {
            label: kind,
            series: cB.dates.map((d: unknown, i: number) => ({ date: d as any, value: Number((arr as any[])[i]) })),
          };
        }
      }
      // C) 配列形式 [{date, value, kind}]
      if (Array.isArray(candidate)) {
        // i) [{date, price, volume}] 形式（cache エンドポイント）
        if (/cache_name=index_2/.test(url) && kind === 'psa10') {
          return {
            label: 'PSA10',
            series: (candidate as any[]).map((x: any) => ({ date: x.date ?? x.t ?? x[0], value: Number(x.price ?? x.value ?? x.v ?? x[1]) })),
          };
        }
        if (/cache_name=index_0/.test(url) && kind === 'mipin') {
          return {
            label: '美品',
            series: (candidate as any[]).map((x: any) => ({ date: x.date ?? x.t ?? x[0], value: Number(x.price ?? x.value ?? x.v ?? x[1]) })),
          };
        }
        // ii) [{date, value, kind}] 形式の一般対応
        const rows = (candidate as any[]).filter((x: any) => {
          const k = String(x?.kind || '').toLowerCase();
          return kind === 'psa10' ? /psa/.test(k) : /美|mipin|beauty/.test(k);
        });
        if (rows.length) {
          return {
            label: kind,
            series: rows.map((x: any) => ({ date: x.date ?? x.t ?? x[0], value: Number(x.value ?? x.v ?? x[1]) })),
          };
        }
      }
      return null;
    };

    for (const p of payloads) {
      const hit = pickSeries(p.url, p.body);
      if (hit) {
        return { ...hit, sourceUrl: p.url };
      }
    }

    // inline <script> 解析も試す
    const inline = await page.evaluate(() => Array.from(document.scripts).map((s) => s.textContent || '').join('\n'));
    try {
      const mSeries = inline.match(/series\s*:\s*\[(.*?)\]\s*,/s);
      const mLabels = inline.match(/labels\s*:\s*\[(.*?)\]\s*,/s);
      if (mSeries && mLabels) {
        const series = safeEvalArrayLiteral(mSeries[1]);
        const labels = safeEvalArrayLiteral(mLabels[1]);
        const s = series.find((it: any) => {
          const name = String(it?.name || '').toLowerCase();
          return kind === 'psa10' ? name.includes('psa10') : name.includes('美') || name.includes('mipin');
        });
        if (s) {
          return {
            label: s.name || kind,
            series: labels.map((d: any, i: number) => ({ date: d, value: Number(s.data[i]) })),
            sourceUrl: pageUrl,
          };
        }
      }
    } catch {
      // noop
    }

    throw new Error('pokeca-chart: 指数シリーズの抽出に失敗しました（DOM/JSONの形が変わった可能性）');
  } finally {
    await browser.close();
  }
}

async function scrapePokecaInline(kind: IndexKind, pageUrl: string, timeoutMs = 45000): Promise<{ label: string; series: SeriesPoint[]; sourceUrl: string }> {
  const resp = await axios.get(pageUrl, { timeout: timeoutMs, responseType: 'text' });
  const html: string = String(resp.data ?? '');
  const mSeries = html.match(/series\s*:\s*\[(.*?)\]\s*,/s);
  const mLabels = html.match(/labels\s*:\s*\[(.*?)\]\s*,/s);
  if (mSeries && mLabels) {
    try {
      const series = safeEvalArrayLiteral(mSeries[1]);
      const labels = safeEvalArrayLiteral(mLabels[1]);
      const s = series.find((it: any) => {
        const name = String(it?.name || '').toLowerCase();
        return kind === 'psa10' ? name.includes('psa10') : name.includes('美') || name.includes('mipin');
      });
      if (s) {
        return {
          label: s.name || kind,
          series: labels.map((d: any, i: number) => ({ date: d, value: Number(s.data[i]) })),
          sourceUrl: pageUrl,
        };
      }
    } catch (e) {
      // noop
    }
  }
  throw new Error('pokeca-chart: inline 解析に失敗しました');
}

// 安全性を高めた配列リテラル評価（最小限のガード + 分離環境）
function safeEvalArrayLiteral(inner: string): any[] {
  // 危険なトークンを簡易ブロック（関数/制御構文/グローバルアクセスなど）
  const black = /(function|=>|while|for|import|class|require|process|globalThis|eval|setTimeout|setInterval)/;
  if (black.test(inner)) throw new Error('unsafe series/labels literal');
  // implied-eval を回避しつつ新たな関数スコープで実行
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function('return [' + inner + ']')();
}

// 外向けヘルパ（任意で利用可）
export async function fetchPokecaIndexLatest(kind: IndexKind, timeoutMs = 45000): Promise<Big> {
  const res = await pRetry(() => scrapePokecaOnce(kind, 'https://pokeca-chart.com/chart-index/', timeoutMs), {
    retries: 2,
    factor: 2,
    minTimeout: 300,
    maxTimeout: Math.max(300, timeoutMs),
  });
  const last = res.series[res.series.length - 1];
  return new Big(String(last.value));
}

export async function fetchPokecaIndexSeries(kind: IndexKind, timeoutMs = 45000) {
  return pRetry(() => scrapePokecaOnce(kind, 'https://pokeca-chart.com/chart-index/', timeoutMs), { retries: 2 });
}

// ------------------------------------------------------------
// CLI（このファイルを直接実行した場合のみ）
// .env の PRICE_SOURCE_URL(S), PRICE_JSON_PATH, REQUEST_TIMEOUT_MS, RETRIES, AGGREGATION を解釈し
// 取得した価格を標準出力へ表示する簡易ツール。
// ------------------------------------------------------------
const isMain = (() => {
  try {
    // tsx 実行時でも fileURLToPath(import.meta.url) と argv[1] は一致する
    return fileURLToPath(import.meta.url) === (process.argv[1] || '');
  } catch {
    return false;
  }
})();

function parseUrlsFromEnv(env: NodeJS.ProcessEnv): string[] {
  if (env.PRICE_SOURCE_URLS) {
    return env.PRICE_SOURCE_URLS.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (env.PRICE_SOURCE_URL) return [env.PRICE_SOURCE_URL];
  return [];
}

async function runCliIfMain() {
  if (!isMain) return;
  // dotenv を遅延ロード（ライブラリ利用時に副作用を避ける）
  try {
    const dotenv = await import('dotenv');
    dotenv.config();
  } catch {}

  try {
    const urls = parseUrlsFromEnv(process.env);
    const jsonPath = process.env.PRICE_JSON_PATH || 'price';
    const timeoutMs = Number(process.env.REQUEST_TIMEOUT_MS || '1500');
    const retries = Number(process.env.RETRIES || '3');
    const agg = (process.env.AGGREGATION as Aggregation) || 'median';

    if (urls.length === 0) {
      console.error('PRICE_SOURCE_URL もしくは PRICE_SOURCE_URLS を .env で設定してください。');
      process.exit(1);
    }

    const v = await fetchAggregate(urls, timeoutMs, retries, agg, jsonPath);
    console.log(v.toString());
  } catch (e) {
    console.error('price.ts CLI 実行失敗:', e);
    process.exit(1);
  }
}

void runCliIfMain();

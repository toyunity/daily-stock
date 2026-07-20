/**
 * KIS (한국투자증권 / Korea Investment & Securities) Open API client — quotes only.
 *
 * Used to anchor the report's Korean-listed numbers (SK Hynix 000660, Samsung
 * 005930) to authoritative exchange data instead of best-effort free sources.
 * Quote endpoints need only appkey/appsecret (no account number).
 *
 * Runs on GitHub Actions (open network). The agent proxy in the Claude session
 * blocks the KIS host (port 9443), so this is invoked from finalize.ts on CI.
 *
 * Env:
 *   KIS_APP_KEY, KIS_APP_SECRET   (required to activate)
 *   KIS_DOMAIN                    (optional; defaults to the real-trading host)
 */

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const REAL_DOMAIN = "https://openapi.koreainvestment.com:9443";

/**
 * TEMPORARY (2026-07-20): one-shot capture of real KIS responses so the test
 * fixtures are actual API output rather than hand-authored guesses. Active only
 * when KIS_DUMP_DIR is set. Remove once fixtures are committed.
 *
 * SECURITY: token issuance responses carry access_token and must never be
 * written to a CI artifact. Only quote endpoints are dumped, and request
 * headers (appkey/appsecret/authorization) are never recorded.
 */
export function shouldDumpResponse(url: string): boolean {
  return !url.includes("/oauth2/");
}

async function dumpResponse(url: string, name: string, body: unknown): Promise<void> {
  const dir = process.env.KIS_DUMP_DIR;
  if (!dir || !shouldDumpResponse(url)) return;
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(resolve(dir, `${name}.json`), JSON.stringify(body, null, 2));
    console.log(`[kis] dumped ${name}.json`);
  } catch (e) {
    // Capture is a side errand — never let it break the report.
    console.warn(`[kis] dump ${name} skipped: ${(e as Error).message}`);
  }
}

export interface KisCreds {
  appkey: string;
  appsecret: string;
  domain?: string;
}

export interface KisQuote {
  code: string;
  price: number; // current/last close (KRW)
  changeAbs: number; // vs previous close
  changePct: number;
}

export interface KisCandle {
  date: string; // YYYYMMDD
  close: number;
}

export function kisCredsFromEnv(): KisCreds | null {
  const appkey = process.env.KIS_APP_KEY;
  const appsecret = process.env.KIS_APP_SECRET;
  if (!appkey || !appsecret) return null;
  return { appkey, appsecret, domain: process.env.KIS_DOMAIN };
}

let cachedToken: { token: string; domain: string } | null = null;

/**
 * Raw token issuance. KIS enforces a strict "issue once, reuse for 24h" policy
 * — reissuing frequently gets rate-limited — so callers should persist the
 * returned token (see finalize's Supabase-backed cache) rather than call this
 * every run. Returns the token and its lifetime in seconds (~86400).
 */
export async function issueAccessToken(creds: KisCreds): Promise<{ token: string; expiresIn: number }> {
  const domain = creds.domain || REAL_DOMAIN;
  const res = await fetch(`${domain}/oauth2/tokenP`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: creds.appkey,
      appsecret: creds.appsecret,
    }),
  });
  if (!res.ok) {
    throw new Error(`KIS token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("KIS token: no access_token in response");
  return { token: data.access_token, expiresIn: data.expires_in ?? 86400 };
}

/** Convenience: issue + in-process cache (single-process use only). */
export async function getAccessToken(creds: KisCreds): Promise<string> {
  const domain = creds.domain || REAL_DOMAIN;
  if (cachedToken && cachedToken.domain === domain) return cachedToken.token;
  const { token } = await issueAccessToken(creds);
  cachedToken = { token, domain };
  return token;
}

function headers(creds: KisCreds, token: string, trId: string) {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
    appkey: creds.appkey,
    appsecret: creds.appsecret,
    tr_id: trId,
    custtype: "P",
  };
}

/**
 * Parse a domestic quote payload. Pure — the fetch lives in getDomesticQuote.
 *
 * prdy_vrss_sign: 1 상한 / 2 상승 / 3 보합 / 4 하한 / 5 하락. prdy_vrss and
 * prdy_ctrt come back as magnitudes, so apply the sign ourselves.
 */
export function parseDomesticQuote(
  output: Record<string, string> | undefined,
  code: string,
): KisQuote {
  if (!output || output.stck_prpr == null) throw new Error(`KIS price ${code}: empty output`);
  const down = output.prdy_vrss_sign === "4" || output.prdy_vrss_sign === "5";
  const sign = down ? -1 : 1;
  return {
    code,
    price: Number(output.stck_prpr),
    changeAbs: Math.abs(Number(output.prdy_vrss)) * sign,
    changePct: Math.abs(Number(output.prdy_ctrt)) * sign,
  };
}

/** Current price for a domestic (KRX) ticker code, e.g. "000660". */
export async function getDomesticQuote(creds: KisCreds, token: string, code: string): Promise<KisQuote> {
  const domain = creds.domain || REAL_DOMAIN;
  const url =
    `${domain}/uapi/domestic-stock/v1/quotations/inquire-price` +
    `?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${encodeURIComponent(code)}`;
  const res = await fetch(url, { headers: headers(creds, token, "FHKST01010100") });
  if (!res.ok) throw new Error(`KIS price ${code} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { output?: Record<string, string> };
  await dumpResponse(url, `domestic-quote-${code}`, data);
  return parseDomesticQuote(data.output, code);
}

export interface KisOverseasQuote {
  symbol: string;
  exchange: string; // NAS | NYS | AMS
  price: number; // last (USD)
  changeAbs: number;
  changePct: number;
}

const US_EXCHANGES = ["NAS", "NYS", "AMS"] as const;

/**
 * Parse one overseas quote payload. Returns null when this exchange has no data
 * for the symbol, which tells the caller to try the next one.
 *
 * `rate`/`diff` may arrive signed or as magnitudes; sign: 4/5 = down.
 */
export function parseOverseasQuote(
  output: Record<string, string> | undefined,
  symbol: string,
  exchange: string,
): KisOverseasQuote | null {
  const last = output ? Number(output.last) : NaN;
  if (!output || !Number.isFinite(last) || last === 0) return null;
  const down = output.sign === "4" || output.sign === "5";
  const rate = Number(output.rate);
  const diff = Number(output.diff);
  return {
    symbol,
    exchange,
    price: last,
    changeAbs: down ? -Math.abs(diff) : Math.abs(diff || 0),
    changePct: down ? -Math.abs(rate) : Math.abs(rate || 0),
  };
}

/**
 * Current price for a US ticker via KIS overseas quotes. KIS needs the exchange
 * code, so try NASDAQ → NYSE → AMEX until one returns data.
 */
export async function getOverseasQuote(
  creds: KisCreds,
  token: string,
  symbol: string,
  exchanges: readonly string[] = US_EXCHANGES,
): Promise<KisOverseasQuote> {
  const domain = creds.domain || REAL_DOMAIN;
  let lastErr: unknown = null;
  for (const excd of exchanges) {
    try {
      const url =
        `${domain}/uapi/overseas-price/v1/quotations/price` +
        `?AUTH=&EXCD=${excd}&SYMB=${encodeURIComponent(symbol)}`;
      const res = await fetch(url, { headers: headers(creds, token, "HHDFS00000300") });
      if (!res.ok) {
        lastErr = new Error(`KIS overseas ${symbol}@${excd} ${res.status}`);
        continue;
      }
      const data = (await res.json()) as { output?: Record<string, string> };
      await dumpResponse(url, `overseas-quote-${symbol}-${excd}`, data);
      const parsed = parseOverseasQuote(data.output, symbol, excd);
      if (!parsed) {
        lastErr = new Error(`KIS overseas ${symbol}@${excd}: empty`);
        continue;
      }
      return parsed;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`KIS overseas ${symbol}: not found`);
}

export interface KisIndex {
  code: string;
  value: number;
  changeAbs: number;
  changePct: number;
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Parse a US index payload. Prefers output1's current fields; falls back to
 * deriving last/prev from the daily series in output2 (newest-first). Throws
 * with the observed keys so a wrong code or renamed field is diagnosable —
 * that error is how the .VIX gap was identified.
 */
export function parseOverseasIndex(
  data: { output1?: Record<string, string>; output2?: Record<string, string>[] },
  code: string,
): KisIndex {
  const n = (v: unknown) => Number(v);
  const o1 = data.output1;
  const cur = o1 ? n(o1.ovrs_nmix_prpr) : NaN;
  if (o1 && Number.isFinite(cur) && cur !== 0) {
    const down = o1.prdy_vrss_sign === "4" || o1.prdy_vrss_sign === "5";
    const abs = Math.abs(n(o1.ovrs_nmix_prdy_vrss)) * (down ? -1 : 1);
    const pct = Math.abs(n(o1.prdy_ctrt)) * (down ? -1 : 1);
    if (Number.isFinite(abs) && Number.isFinite(pct)) {
      return { code, value: cur, changeAbs: round2(abs), changePct: round2(pct) };
    }
  }

  const closes = (data.output2 ?? [])
    .map((r) => n(r.ovrs_nmix_prpr))
    .filter((x) => Number.isFinite(x) && x !== 0);
  if (closes.length >= 2) {
    const [last, prev] = [closes[0], closes[1]];
    const abs = last - prev;
    return { code, value: last, changeAbs: round2(abs), changePct: round2(prev ? (abs / prev) * 100 : 0) };
  }

  throw new Error(
    `KIS index ${code}: unparseable (o1 keys=${Object.keys(o1 ?? {}).slice(0, 10).join(",")}; o2 keys=${Object.keys(data.output2?.[0] ?? {}).slice(0, 10).join(",")})`,
  );
}

/**
 * US index quote via KIS overseas index chart (tr_id FHKST03030100, market "N").
 * Codes: SPX (S&P 500), COMP (Nasdaq Composite), DJI (Dow), VIX. Parses the
 * current fields when present, else derives last/prev from the daily series.
 * Throws with the observed output keys so wrong codes/fields are diagnosable.
 */
export async function getOverseasIndex(creds: KisCreds, token: string, code: string): Promise<KisIndex> {
  const domain = creds.domain || REAL_DOMAIN;
  const now = Date.now();
  const url =
    `${domain}/uapi/overseas-price/v1/quotations/inquire-daily-chartprice` +
    `?FID_COND_MRKT_DIV_CODE=N&FID_INPUT_ISCD=${encodeURIComponent(code)}` +
    `&FID_INPUT_DATE_1=${ymd(new Date(now - 25 * 864e5))}&FID_INPUT_DATE_2=${ymd(new Date(now))}` +
    `&FID_PERIOD_DIV_CODE=D`;
  const res = await fetch(url, { headers: headers(creds, token, "FHKST03030100") });
  if (!res.ok) throw new Error(`KIS index ${code} ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const data = (await res.json()) as {
    output1?: Record<string, string>;
    output2?: Record<string, string>[];
  };
  await dumpResponse(url, `overseas-index-${code.replace(/^\./, "dot-")}`, data);
  return parseOverseasIndex(data, code);
}

/** Parse daily candles. KIS returns newest-first; we emit oldest-first. */
export function parseDomesticDaily(
  rows: Record<string, string>[] | undefined,
  limit: number,
): KisCandle[] {
  const candles: KisCandle[] = (rows ?? [])
    .filter((r) => r.stck_bsop_date && r.stck_clpr)
    .map((r) => ({ date: r.stck_bsop_date, close: Number(r.stck_clpr) }));
  candles.reverse();
  return candles.slice(-limit);
}

/** Recent daily closes (most-recent last), up to ~30 sessions. */
export async function getDomesticDaily(
  creds: KisCreds,
  token: string,
  code: string,
  limit = 10,
): Promise<KisCandle[]> {
  const domain = creds.domain || REAL_DOMAIN;
  const url =
    `${domain}/uapi/domestic-stock/v1/quotations/inquire-daily-price` +
    `?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${encodeURIComponent(code)}` +
    `&FID_PERIOD_DIV_CODE=D&FID_ORG_ADJ_PRC=1`;
  const res = await fetch(url, { headers: headers(creds, token, "FHKST01010400") });
  if (!res.ok) throw new Error(`KIS daily ${code} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { output?: Record<string, string>[] };
  await dumpResponse(url, `domestic-daily-${code}`, data);
  return parseDomesticDaily(data.output, limit);
}

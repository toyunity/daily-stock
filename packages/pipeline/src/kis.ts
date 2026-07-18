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

const REAL_DOMAIN = "https://openapi.koreainvestment.com:9443";

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

export async function getAccessToken(creds: KisCreds): Promise<string> {
  const domain = creds.domain || REAL_DOMAIN;
  if (cachedToken && cachedToken.domain === domain) return cachedToken.token;
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
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("KIS token: no access_token in response");
  cachedToken = { token: data.access_token, domain };
  return data.access_token;
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

/** Current price for a domestic (KRX) ticker code, e.g. "000660". */
export async function getDomesticQuote(creds: KisCreds, token: string, code: string): Promise<KisQuote> {
  const domain = creds.domain || REAL_DOMAIN;
  const url =
    `${domain}/uapi/domestic-stock/v1/quotations/inquire-price` +
    `?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${encodeURIComponent(code)}`;
  const res = await fetch(url, { headers: headers(creds, token, "FHKST01010100") });
  if (!res.ok) throw new Error(`KIS price ${code} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { output?: Record<string, string> };
  const o = data.output;
  if (!o || o.stck_prpr == null) throw new Error(`KIS price ${code}: empty output`);
  return {
    code,
    price: Number(o.stck_prpr),
    changeAbs: Number(o.prdy_vrss) * (o.prdy_vrss_sign === "4" || o.prdy_vrss_sign === "5" ? -1 : 1),
    changePct: Number(o.prdy_ctrt),
  };
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
  const rows = data.output ?? [];
  const candles: KisCandle[] = rows
    .filter((r) => r.stck_bsop_date && r.stck_clpr)
    .map((r) => ({ date: r.stck_bsop_date, close: Number(r.stck_clpr) }));
  // API returns newest-first; return oldest-first, trimmed to `limit`.
  candles.reverse();
  return candles.slice(-limit);
}

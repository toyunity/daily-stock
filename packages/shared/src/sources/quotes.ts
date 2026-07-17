import type { IndexQuote } from "../schema";

/**
 * Index / macro quotes. Primary: Stooq CSV (no key required) as a resilient
 * free source for index closes; designed to degrade gracefully so the pipeline
 * never dies when a single symbol is unavailable.
 */

export interface QuoteTarget {
  name: string;
  symbol: string; // display symbol
  stooq: string; // stooq symbol
}

export const DEFAULT_INDEX_TARGETS: QuoteTarget[] = [
  { name: "S&P 500", symbol: "^GSPC", stooq: "^spx" },
  { name: "Nasdaq Composite", symbol: "^IXIC", stooq: "^ndq" },
  { name: "Dow Jones", symbol: "^DJI", stooq: "^dji" },
  { name: "Russell 2000", symbol: "^RUT", stooq: "^rut" },
  { name: "VIX", symbol: "^VIX", stooq: "^vix" },
];

async function fetchStooqDaily(stooqSymbol: string): Promise<{ close: number; prevClose: number } | null> {
  // Stooq daily CSV: Date,Open,High,Low,Close,Volume
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&i=d`;
  const res = await fetch(url, { headers: { "User-Agent": "daily-stock/0.1" } });
  if (!res.ok) return null;
  const text = await res.text();
  const rows = text.trim().split("\n");
  if (rows.length < 3) return null;
  const parseClose = (line: string) => {
    const cols = line.split(",");
    const c = Number(cols[4]);
    return Number.isFinite(c) ? c : null;
  };
  const last = parseClose(rows[rows.length - 1]);
  const prev = parseClose(rows[rows.length - 2]);
  if (last == null || prev == null) return null;
  return { close: last, prevClose: prev };
}

export async function fetchIndexQuotes(
  targets: QuoteTarget[] = DEFAULT_INDEX_TARGETS,
): Promise<IndexQuote[]> {
  const results = await Promise.allSettled(
    targets.map(async (t) => {
      const q = await fetchStooqDaily(t.stooq);
      if (!q) throw new Error(`no quote for ${t.symbol}`);
      const changeAbs = q.close - q.prevClose;
      const changePct = q.prevClose !== 0 ? (changeAbs / q.prevClose) * 100 : 0;
      const quote: IndexQuote = {
        name: t.name,
        symbol: t.symbol,
        value: round2(q.close),
        change_abs: round2(changeAbs),
        change_pct: round2(changePct),
      };
      return quote;
    }),
  );
  return results
    .filter((r): r is PromiseFulfilledResult<IndexQuote> => r.status === "fulfilled")
    .map((r) => r.value);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

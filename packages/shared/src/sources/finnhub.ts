import type { FetchContext, RawItem, SourceAdapter } from "./types";

/**
 * Finnhub free-tier adapter: general market news + per-ticker company news.
 * Skips itself automatically when FINNHUB_API_KEY is not present.
 */

interface FinnhubNews {
  category?: string;
  datetime: number; // unix seconds
  headline: string;
  id: number;
  source: string;
  summary: string;
  url: string;
  related?: string;
}

const BASE = "https://finnhub.io/api/v1";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const finnhubAdapter: SourceAdapter = {
  id: "finnhub",
  enabled: (ctx) => Boolean(ctx.env.FINNHUB_API_KEY),
  async fetch(ctx: FetchContext): Promise<RawItem[]> {
    const key = ctx.env.FINNHUB_API_KEY!;
    const sinceSec = Math.floor(ctx.since.getTime() / 1000);
    const items: RawItem[] = [];

    // 1) General market news
    const general = await getJson<FinnhubNews[]>(
      `${BASE}/news?category=general&token=${key}`,
    );
    for (const n of general) {
      if (n.datetime < sinceSec) continue;
      items.push(toRaw(n));
    }

    // 2) Company news for the focus universe (bounded to respect rate limits)
    const tickers = (ctx.tickers ?? []).slice(0, 8);
    const from = ctx.since.toISOString().slice(0, 10);
    const to = new Date().toISOString().slice(0, 10);
    for (const t of tickers) {
      try {
        const news = await getJson<FinnhubNews[]>(
          `${BASE}/company-news?symbol=${encodeURIComponent(t)}&from=${from}&to=${to}&token=${key}`,
        );
        for (const n of news.slice(0, 10)) {
          if (n.datetime < sinceSec) continue;
          items.push({ ...toRaw(n), tickers: [t] });
        }
      } catch {
        // one ticker failing must not abort the batch
      }
    }
    return items;
  },
};

function toRaw(n: FinnhubNews): RawItem {
  return {
    title: n.headline,
    body: n.summary ?? "",
    url: n.url,
    source: n.source || "Finnhub",
    publishedAt: new Date(n.datetime * 1000).toISOString(),
    tickers: n.related ? n.related.split(",").filter(Boolean) : undefined,
  };
}

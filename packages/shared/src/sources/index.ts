import type { FetchContext, RawItem, SourceAdapter } from "./types";
import { finnhubAdapter } from "./finnhub";
import { rssAdapters } from "./rss";

export * from "./types";
export * from "./rss";
export * from "./finnhub";
export * from "./quotes";

/** All news/press adapters. Add or remove sources here. */
export const ALL_ADAPTERS: SourceAdapter[] = [finnhubAdapter, ...rssAdapters];

/**
 * Run every enabled adapter in parallel, tolerate individual failures, and
 * de-duplicate by URL. A single source erroring never aborts collection.
 */
export async function collectRawItems(
  ctx: FetchContext,
  adapters: SourceAdapter[] = ALL_ADAPTERS,
): Promise<{ items: RawItem[]; errors: { id: string; message: string }[] }> {
  const enabled = adapters.filter((a) => a.enabled(ctx));
  const settled = await Promise.allSettled(enabled.map((a) => a.fetch(ctx)));

  const seen = new Set<string>();
  const items: RawItem[] = [];
  const errors: { id: string; message: string }[] = [];

  settled.forEach((res, i) => {
    const adapter = enabled[i];
    if (res.status === "rejected") {
      errors.push({ id: adapter.id, message: String(res.reason?.message ?? res.reason) });
      return;
    }
    for (const item of res.value) {
      const key = item.url.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  });

  items.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  return { items, errors };
}

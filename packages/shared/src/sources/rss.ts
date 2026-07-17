import type { FetchContext, RawItem, SourceAdapter } from "./types";

/**
 * Dependency-free RSS/Atom reader for credible newswire / regulator feeds.
 * Parses just enough of the feed to extract title, link, description, date.
 * No external XML library so it runs in Deno Edge Functions unchanged.
 */

export interface RssSourceConfig {
  id: string;
  name: string;
  url: string;
}

// Credible, fact-forward feeds. Opinion/editorial sections are intentionally excluded.
export const DEFAULT_RSS_SOURCES: RssSourceConfig[] = [
  {
    id: "sec-edgar-8k",
    name: "SEC EDGAR (8-K)",
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&company=&dateb=&owner=include&count=40&output=atom",
  },
  {
    id: "prnewswire-financial",
    name: "PR Newswire (Financial)",
    url: "https://www.prnewswire.com/rss/financial-services-latest-news/financial-services-latest-news-list.rss",
  },
  {
    id: "fed-press",
    name: "Federal Reserve Press",
    url: "https://www.federalreserve.gov/feeds/press_all.xml",
  },
];

function extractTag(block: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  if (!m) return undefined;
  return decodeEntities(stripCdata(m[1]).trim());
}

function extractLink(block: string): string | undefined {
  // RSS <link>...</link> or Atom <link href="..."/>
  const rss = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
  if (rss && rss[1].trim()) return decodeEntities(rss[1].trim());
  const atom = block.match(/<link[^>]*href=["']([^"']+)["']/i);
  return atom ? decodeEntities(atom[1]) : undefined;
}

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function splitItems(xml: string): string[] {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  const entries = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  return [...items, ...entries];
}

export function makeRssAdapter(cfg: RssSourceConfig): SourceAdapter {
  return {
    id: `rss:${cfg.id}`,
    enabled: () => true,
    async fetch(ctx: FetchContext): Promise<RawItem[]> {
      const res = await fetch(cfg.url, {
        headers: { "User-Agent": "daily-stock/0.1 (+https://github.com/toyunity/daily-stock)" },
      });
      if (!res.ok) throw new Error(`RSS ${cfg.id} HTTP ${res.status}`);
      const xml = await res.text();
      const out: RawItem[] = [];
      for (const block of splitItems(xml)) {
        const title = extractTag(block, "title");
        const url = extractLink(block);
        if (!title || !url) continue;
        const rawDate =
          extractTag(block, "pubDate") ??
          extractTag(block, "updated") ??
          extractTag(block, "published") ??
          extractTag(block, "dc:date");
        const publishedAt = rawDate ? new Date(rawDate) : new Date();
        if (!Number.isNaN(publishedAt.getTime()) && publishedAt < ctx.since) continue;
        const body = stripHtml(
          extractTag(block, "description") ?? extractTag(block, "summary") ?? extractTag(block, "content") ?? "",
        );
        out.push({
          title: stripHtml(title),
          body,
          url,
          source: cfg.name,
          publishedAt: (Number.isNaN(publishedAt.getTime()) ? new Date() : publishedAt).toISOString(),
        });
      }
      return out;
    },
  };
}

export const rssAdapters: SourceAdapter[] = DEFAULT_RSS_SOURCES.map(makeRssAdapter);

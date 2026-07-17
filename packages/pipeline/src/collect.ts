import { mkdirSync, writeFileSync } from "node:fs";
import { sources } from "@daily-stock/shared";
import { env, usEasternDate } from "./env";
import { OUT_DIR, ARTICLES_PATH, QUOTES_PATH, type ArticlesFile } from "./paths";

/**
 * Stage 1 of the dispatch pipeline: collect market quotes + credible news/press
 * into JSON handoff files. No LLM, no Supabase — only public feeds (+ optional
 * FINNHUB_API_KEY). The Claude agent then reads articles.json to extract facts.
 */

const FOCUS_TICKERS = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "MU"];

async function main() {
  const date = usEasternDate();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  mkdirSync(OUT_DIR, { recursive: true });

  const quotes = await sources.fetchIndexQuotes();
  console.log(`[collect] ${quotes.length} index quotes`);

  const { items, errors } = await sources.collectRawItems({
    since,
    tickers: FOCUS_TICKERS,
    env: env.raw,
  });
  console.log(`[collect] ${items.length} news items, ${errors.length} source errors`);
  for (const e of errors) console.warn(`  - ${e.id}: ${e.message}`);

  const articles: ArticlesFile = {
    date,
    since: since.toISOString(),
    count: items.length,
    errors,
    items: items.slice(0, 60).map((it) => ({
      title: it.title,
      body: it.body,
      url: it.url,
      source: it.source,
      publishedAt: it.publishedAt,
      tickers: it.tickers,
    })),
  };

  writeFileSync(QUOTES_PATH, JSON.stringify(quotes, null, 2));
  writeFileSync(ARTICLES_PATH, JSON.stringify(articles, null, 2));
  console.log(`[collect] wrote ${QUOTES_PATH}`);
  console.log(`[collect] wrote ${ARTICLES_PATH} (session ${date})`);
}

main().catch((e) => {
  console.error("[collect] failed:", e);
  process.exit(1);
});

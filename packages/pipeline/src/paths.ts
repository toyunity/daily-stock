import { resolve } from "node:path";

/**
 * Handoff files between the three dispatch stages. `collect` writes articles +
 * quotes; the Claude agent reads articles and writes report.json; `finalize`
 * reads report.json + quotes and persists to Supabase.
 *
 * Override the directory with PIPELINE_OUT. Defaults to ./out relative to the
 * pipeline package (cwd when run via `npm run --workspace @daily-stock/pipeline`).
 */
export const OUT_DIR = process.env.PIPELINE_OUT
  ? resolve(process.env.PIPELINE_OUT)
  : resolve(process.cwd(), "out");

export const ARTICLES_PATH = resolve(OUT_DIR, "articles.json");
export const QUOTES_PATH = resolve(OUT_DIR, "quotes.json");
export const REPORT_PATH = resolve(OUT_DIR, "report.json");

/** Shape written by collect.ts and read by the agent + finalize.ts. */
export interface ArticlesFile {
  date: string; // US/Eastern session date
  since: string; // ISO lower bound
  count: number;
  errors: { id: string; message: string }[];
  items: {
    title: string;
    body: string;
    url: string;
    source: string;
    publishedAt: string;
    tickers?: string[];
  }[];
}

/** A raw, un-refined item collected from an external source. */
export interface RawItem {
  title: string;
  body: string;
  url: string;
  source: string;
  publishedAt: string; // ISO
  tickers?: string[];
}

export interface FetchContext {
  /** Only keep items published at or after this instant. */
  since: Date;
  /** Optional universe of tickers to focus company-news queries on. */
  tickers?: string[];
  /** Per-source API keys; adapters skip themselves when their key is absent. */
  env: Record<string, string | undefined>;
}

export interface SourceAdapter {
  id: string;
  /** Whether this adapter has what it needs to run (e.g. an API key). */
  enabled(ctx: FetchContext): boolean;
  fetch(ctx: FetchContext): Promise<RawItem[]>;
}

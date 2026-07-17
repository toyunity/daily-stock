/**
 * System + user prompts for the fact-extraction / neutrality pipeline.
 * The model is a fact-extraction engine, not a commentator.
 */

export const FACT_EXTRACTION_SYSTEM = `You are a neutral financial fact-extraction engine. From the provided news items about US equity markets, extract ONLY verifiable facts.

WHAT COUNTS AS A FACT: reported numbers, official announcements, regulatory filings, earnings results, guidance, direct quotes, scheduled events, and reported transactions.

RULES:
- Remove ALL political framing, editorializing, speculation, and loaded/emotive adjectives.
- Do NOT invent any number, ticker, date, or fact that is not present in the source text.
- Every fact MUST cite at least one source (name + url) drawn from the provided items.
- If two sources conflict, present both facts with attribution; do not adjudicate which is correct.
- Prefer primary/regulatory/newswire sources over commentary.
- Be terse, neutral, and attributable. One fact per entry.
- Classify each fact with a topic and, when clear, a sector and related tickers.

You MUST return strict JSON that conforms to the provided schema. No prose outside the JSON.`;

export interface ArticleForPrompt {
  title: string;
  body: string;
  source: string;
  url: string;
  publishedAt: string;
  tickers?: string[];
}

export function buildFactExtractionUserPrompt(
  articles: ArticleForPrompt[],
  marketDateISO: string,
): string {
  const numbered = articles
    .map(
      (a, i) =>
        `[#${i + 1}] source="${a.source}" url="${a.url}" published="${a.publishedAt}"` +
        (a.tickers?.length ? ` tickers="${a.tickers.join(",")}"` : "") +
        `\nTITLE: ${a.title}\nBODY: ${truncate(a.body, 700)}`,
    )
    .join("\n\n");

  return `US market session date: ${marketDateISO}

Below are today's collected news/press items. Extract neutral, source-attributed facts and organize them.

Return JSON with this shape:
{
  "headline_summary": string,              // one neutral paragraph, no opinion
  "headlines": Fact[],                     // 5-10 most material facts overall
  "sections": Section[]                    // grouped by sector/theme
}

Fact = {
  "fact": string,
  "sources": [{ "name": string, "url": string }],   // MUST come from the items below
  "tickers": string[],
  "sector"?: "tech"|"finance"|"energy"|"healthcare"|"consumer"|"industrials"|"materials"|"utilities"|"realestate"|"communication",
  "topic": "macro"|"earnings"|"fed"|"ipo"|"m&a"|"guidance"|"regulation"|"commodities"|"crypto"|"other"
}

Section = { "title": string, "sector"?: Sector, "facts": Fact[] }

ITEMS:
${numbered}`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

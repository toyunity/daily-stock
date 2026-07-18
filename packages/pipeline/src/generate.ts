import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { sources, LlmReportOutputSchema, type IndexQuote } from "@daily-stock/shared";
import { chatJson } from "./github-models";
import { REPORT_PATH } from "./paths";

/**
 * Generate stage (runs on GitHub Actions, open network — no Claude, no cost).
 *
 * Replaces the Max-dispatch session, which was unusable here because scheduled
 * containers spin up with no repo cloned. Actions always has the checkout, a
 * write-capable GITHUB_TOKEN, and open egress, so we do everything in one job:
 *
 *   1) fetch free market data  (stooq: indices + SK Hynix / Samsung history)
 *   2) fetch real news items   (Google News RSS — dated, sourced, no key)
 *   3) GitHub Models (gpt-4o)  turns that grounded data into report.json
 *   4) validate against LlmReportOutputSchema, write reports/report.json
 *
 * finalize.ts then renders images + upserts Supabase from the same file.
 *
 * Anti-hallucination: the model is given ONLY fetched numbers + real article
 * URLs and is told to attribute every fact to a provided source and never to
 * invent figures.
 */

// ---------------------------------------------------------------------------
// Free market data (stooq CSV, no key)
// ---------------------------------------------------------------------------

interface Candle {
  date: string;
  close: number;
}

async function stooqHistory(stooqSymbol: string, n: number): Promise<Candle[]> {
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&i=d`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "daily-stock/0.1" } });
    if (!res.ok) return [];
    const rows = (await res.text()).trim().split("\n");
    if (rows.length < 2) return [];
    const out: Candle[] = [];
    for (const line of rows.slice(1)) {
      const cols = line.split(",");
      const close = Number(cols[4]);
      if (cols[0] && Number.isFinite(close)) out.push({ date: cols[0], close });
    }
    return out.slice(-n);
  } catch {
    return [];
  }
}

function pctChange(series: Candle[]): { last: number; prev: number; abs: number; pct: number } | null {
  if (series.length < 2) return null;
  const last = series[series.length - 1].close;
  const prev = series[series.length - 2].close;
  const abs = last - prev;
  const pct = prev !== 0 ? (abs / prev) * 100 : 0;
  return { last, prev, abs: round2(abs), pct: round2(pct) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Free news (Google News RSS, no key) — the WebSearch replacement
// ---------------------------------------------------------------------------

interface NewsItem {
  title: string;
  url: string;
  source: string;
  published: string;
  query: string;
}

const NEWS_QUERIES = [
  "US stock market close S&P 500 Nasdaq Dow",
  "Federal Reserve interest rates inflation",
  "SK Hynix HBM earnings",
  "SK하이닉스 실적 주가",
  "Micron memory chips DRAM HBM Nvidia",
  "Samsung Electronics semiconductor",
  "Iran Israel Middle East conflict",
  "Trump Iran statement",
];

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function parseRssItems(xml: string, query: string, limit: number): NewsItem[] {
  const items: NewsItem[] = [];
  const blocks = xml.split(/<item>/).slice(1);
  for (const block of blocks.slice(0, limit)) {
    const grab = (tag: string) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return m ? decodeEntities(m[1]) : "";
    };
    const title = grab("title");
    const url = grab("link");
    const source = grab("source") || "news";
    const published = grab("pubDate");
    if (title && url) items.push({ title, url, source, published, query });
  }
  return items;
}

async function fetchGoogleNews(query: string, limit: number): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 daily-stock/0.1" } });
    if (!res.ok) return [];
    return parseRssItems(await res.text(), query, limit);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const token = process.env.GITHUB_MODELS_TOKEN || process.env.GITHUB_TOKEN || "";
  if (!token) throw new Error("GITHUB_MODELS_TOKEN / GITHUB_TOKEN is required");
  const cfg = {
    token,
    endpoint: process.env.GITHUB_MODELS_ENDPOINT,
    model: process.env.GITHUB_MODELS_MODEL,
  };

  const today = new Date().toISOString().slice(0, 10);

  // 1) market data
  const [indices, hynixHist, samsungHist] = await Promise.all([
    sources.fetchIndexQuotes(),
    stooqHistory("000660.kr", 10),
    stooqHistory("005930.kr", 10),
  ]);
  console.log(`[generate] indices=${indices.length} hynix=${hynixHist.length} samsung=${samsungHist.length}`);

  const hynixChg = pctChange(hynixHist);
  const hynixSeries = hynixHist.map((c) => ({ label: c.date.slice(5), value: c.close }));

  // 2) news
  const newsGroups = await Promise.all(NEWS_QUERIES.map((q) => fetchGoogleNews(q, 6)));
  const news = dedupeNews(newsGroups.flat()).slice(0, 42);
  console.log(`[generate] news items=${news.length}`);
  if (news.length === 0) {
    console.warn("[generate] WARNING: no news fetched; report will be thin");
  }

  // 3) LLM
  const system = buildSystemPrompt();
  const user = buildUserPrompt({ today, indices, hynixChg, hynixSeries, samsungHist, news });

  console.log(`[generate] calling GitHub Models (${cfg.model ?? "openai/gpt-4o"})…`);
  const raw = await chatJson(cfg, system, user);

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error("[generate] model did not return valid JSON:\n", raw.slice(0, 1000));
    throw e;
  }

  // Repair common gpt-4o schema gaps before validation — the numbers are
  // KIS-overwritten at finalize anyway, so placeholders are safe.
  repairForSchema(parsed);

  const result = LlmReportOutputSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[generate] schema validation failed:");
    console.error(JSON.stringify(result.error.issues.slice(0, 25), null, 2));
    console.error("--- model output (truncated) ---\n", JSON.stringify(parsed).slice(0, 1500));
    throw new Error("SCHEMA_INVALID");
  }

  // Ensure indices are present even if the model omitted them.
  const out = result.data;
  if ((!out.indices || out.indices.length === 0) && indices.length) {
    out.indices = indices;
  }

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(out, null, 2));
  console.log(`[generate] wrote ${REPORT_PATH} (headlines=${out.headlines.length}, sections=${out.sections.length}, focus=${out.focus ? "yes" : "no"}, geo=${out.geopolitics ? "yes" : "no"})`);
}

// Indices seeded when stooq is unavailable on the runner. finalize KIS-anchors
// ^GSPC/^IXIC/^DJI, so 0-value placeholders get replaced with real closes.
const SEED_INDICES = [
  { name: "S&P 500", symbol: "^GSPC", value: 0, change_pct: 0, change_abs: 0 },
  { name: "나스닥 종합", symbol: "^IXIC", value: 0, change_pct: 0, change_abs: 0 },
  { name: "다우존스", symbol: "^DJI", value: 0, change_pct: 0, change_abs: 0 },
];

/**
 * Coerce imperfect model output toward LlmReportOutputSchema. gpt-4o often omits
 * focus.price or emits facts without sources; rather than fail the whole run, we
 * patch placeholders (KIS overwrites numbers at finalize) and drop unsourced
 * facts so a valid report always ships.
 */
function repairForSchema(o: any): void {
  if (!o || typeof o !== "object") return;

  if (!Array.isArray(o.indices) || o.indices.length === 0) o.indices = SEED_INDICES.map((x) => ({ ...x }));

  if (o.focus && typeof o.focus === "object") {
    if (!o.focus.price || typeof o.focus.price !== "object") {
      o.focus.price = { value: 0, currency: "KRW", change_pct: 0, change_abs: 0, as_of: "" };
    }
    if (typeof o.focus.price.value !== "number") o.focus.price.value = 0;
  }

  const validUrl = (u: unknown) => typeof u === "string" && /^https?:\/\//.test(u);
  const cleanFacts = (arr: any): any[] =>
    Array.isArray(arr)
      ? arr
          .filter((f) => f && typeof f.fact === "string" && f.fact && Array.isArray(f.sources) && f.sources.some((s: any) => s && validUrl(s.url)))
          .map((f) => ({ ...f, sources: f.sources.filter((s: any) => s && validUrl(s.url)) }))
      : [];
  o.headlines = cleanFacts(o.headlines);
  if (Array.isArray(o.sections)) {
    o.sections = o.sections.map((s: any) => ({ ...s, facts: cleanFacts(s?.facts) }));
  } else {
    o.sections = [];
  }
}

function dedupeNews(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const it of items) {
    const key = it.title.toLowerCase().replace(/\s+/g, " ").slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

function buildSystemPrompt(): string {
  return [
    "너는 미국 증시 일일 리포트를 만드는 금융 애널리스트다. 반드시 한국어로, 중립적·팩트 기반으로 쓴다.",
    "규칙:",
    "- 제공된 뉴스 항목과 시세 수치만 사용한다. 제공되지 않은 수치를 지어내지 마라.",
    "- 모든 fact/quote에는 제공된 뉴스 항목의 실제 url을 sources로 붙인다.",
    "- 정치적 논평·추측·감정적 수식어는 배제하고 검증 가능한 사실만. 발언은 해당 주체에 귀속.",
    "- 심층 분석 대상은 SK하이닉스(000660.KS). 제공된 시세로 price/price_series/price_context를 채우고, 동인·리스크·촉매·강세/기본/약세 시나리오를 뉴스 근거로 작성.",
    "- 메모리 반도체 관련은 sector를 \"memory\"로.",
    "- 반드시 아래 JSON 스키마와 정확히 일치하는 단일 JSON 객체만 출력한다(그 외 텍스트 금지).",
    "",
    SCHEMA_TEXT,
  ].join("\n");
}

function buildUserPrompt(d: {
  today: string;
  indices: IndexQuote[];
  hynixChg: { last: number; prev: number; abs: number; pct: number } | null;
  hynixSeries: { label: string; value: number }[];
  samsungHist: Candle[];
  news: NewsItem[];
}): string {
  const hynixBlock = d.hynixChg
    ? `현재가(종가) ₩${d.hynixChg.last.toLocaleString()} / 전일대비 ${d.hynixChg.abs >= 0 ? "+" : ""}${d.hynixChg.abs} (${d.hynixChg.pct}%). 통화 KRW. 최근 추이(price_series로 사용): ${JSON.stringify(d.hynixSeries)}`
    : "시세 조회 실패 — focus.price는 뉴스에 명시된 수치가 있으면만 사용, 없으면 focus를 생략.";

  const samsungLast = d.samsungHist.length ? d.samsungHist[d.samsungHist.length - 1].close : null;

  const newsLines = d.news
    .map((n, i) => `${i + 1}. [${n.query}] ${n.title} — ${n.source} (${n.published}) :: ${n.url}`)
    .join("\n");

  return [
    `오늘 날짜: ${d.today}`,
    "",
    `지수 종가(그대로 indices에 사용 가능): ${JSON.stringify(d.indices)}`,
    "",
    `SK하이닉스(000660.KS) 시세: ${hynixBlock}`,
    samsungLast ? `삼성전자(005930.KS) 최근 종가: ₩${samsungLast.toLocaleString()}` : "",
    "",
    "아래는 실제 뉴스 항목(제목 — 출처 (발행) :: URL)이다. fact/quote의 sources.url은 반드시 이 목록의 URL에서 가져와라:",
    newsLines || "(뉴스 없음)",
    "",
    "위 데이터만으로 report.json을 작성하라. headlines 6~10개, sections 3~6개, focus(SK하이닉스), geopolitics(중동/이란 관련 뉴스가 있으면)를 포함하라.",
  ]
    .filter(Boolean)
    .join("\n");
}

const SCHEMA_TEXT = `스키마:
{
  "headline_summary": string,                 // 중립적 한 문단(SK하이닉스 중심)
  "indices": [{ "name","symbol","value":number,"change_pct":number,"change_abs":number }],
  "macro": [{ "label","value","unit","change" }],
  "movers": { "gainers":[{"ticker","pct":number}], "losers":[{"ticker","pct":number}] },
  "sector_perf": [{ "label","pct":number,"sector"? }],
  "focus": {
    "ticker","name",
    "price": { "value":number,"currency":"KRW"|"USD","change_pct":number,"change_abs":number,"as_of":string },
    "price_context": string,
    "price_series": [{ "label","value":number }],
    "thesis": string,
    "rating": string,
    "target": { "avg":number,"high":number,"low":number,"currency":string },
    "drivers": [{ "point","source":{"name","url"} }],
    "risks":   [{ "point","source":{"name","url"} }],
    "catalysts":[{ "date","event" }],
    "scenarios":[{ "kind":"bull"|"base"|"bear","label","condition","implication" }],
    "watch": string[]
  },
  "headlines": [{ "fact", "sources":[{"name","url"}], "tickers":string[], "sector"?, "topic" }],
  "sections": [{ "title", "sector"?, "facts":[ 위 fact 형태 ] }],
  "geopolitics": {
    "headline","theater","summary",
    "escalation_level":1-5,"escalation_label",
    "actors":[{ "name","role","stance":"hard"|"mixed"|"soft","quotes":[{"text","source":{"name","url"}}] }],
    "timeline":[{ "date","title","detail","severity":"normal"|"high","sources":[{"name","url"}] }],
    "market_note","oil_series":[{ "label","value":number }],"watchpoints":string[]
  }
}
topic 허용값: macro|earnings|fed|ipo|m&a|guidance|regulation|commodities|crypto|other
sector 허용값: tech|memory|finance|energy|healthcare|consumer|industrials|materials|utilities|realestate|communication
target/price/oil_series 등 수치는 뉴스나 제공 시세에 근거가 없으면 해당 항목을 생략하라(지어내지 말 것). focus.target은 뉴스에 목표가 근거가 없으면 생략 가능.`;

main().catch((e) => {
  console.error("[generate] failed:", e);
  process.exit(1);
});

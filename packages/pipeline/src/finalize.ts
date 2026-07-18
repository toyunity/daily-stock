import { existsSync, readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  ReportContentSchema,
  LlmReportOutputSchema,
  personalizeReport,
  sources,
  llm,
  type ReportContent,
  type IndexQuote,
} from "@daily-stock/shared";
import { env, usEasternDate } from "./env";
import { ARTICLES_PATH, QUOTES_PATH, REPORT_PATH, type ArticlesFile } from "./paths";
import { renderReportCard } from "./render";
import { generateAiHeader, renderMoodBanner } from "./header";
import {
  kisCredsFromEnv,
  getAccessToken,
  getDomesticQuote,
  getDomesticDaily,
  getOverseasQuote,
} from "./kis";

/**
 * Finalize stage (runs on GitHub Actions, open network). Takes the dispatch
 * agent's report.json, fetches authoritative index quotes, renders images, and
 * upserts to Supabase with per-user personalization fan-out.
 *
 * Self-sufficient: needs only report.json + Supabase creds. Quotes are fetched
 * live; collect's articles.json/quotes.json are used opportunistically if present.
 * No Anthropic key — the LLM step was done by the dispatch agent on Max.
 */

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

async function main() {
  const runStart = Date.now();

  // Required: the agent-produced report.
  const extracted = LlmReportOutputSchema.parse(readJson(REPORT_PATH));

  // Anchor Korean (focus) + US (movers) numbers to authoritative KIS quotes
  // when credentials are present. The narrative stays as written; only the
  // structured numbers are corrected. Best-effort — never blocks the report.
  await enrichFocusWithKis(extracted);
  await enrichMoversWithKis(extracted);

  // Optional collect artifacts (present when collect ran first).
  const articles = existsSync(ARTICLES_PATH) ? readJson<ArticlesFile>(ARTICLES_PATH) : null;
  const reportDate = articles?.date ?? usEasternDate();

  // Quotes: prefer the agent's researched index closes; else a live fetch; else
  // collect's file. Live sources can be rate-limited/blocked on CI, so the
  // agent-provided numbers are the most reliable.
  let quotes: IndexQuote[] = extracted.indices ?? [];
  if (quotes.length === 0) {
    try {
      quotes = await sources.fetchIndexQuotes();
    } catch {
      /* ignore; fall through to file/empty */
    }
  }
  if (quotes.length === 0 && existsSync(QUOTES_PATH)) {
    quotes = readJson<IndexQuote[]>(QUOTES_PATH);
  }
  console.log(`[finalize] ${quotes.length} index quotes, session ${reportDate}`);

  // Anti-hallucination guardrail only when we have a source corpus to check
  // against (collect path). Dispatch-authored facts carry their own citations.
  if (articles && articles.items.length > 0) {
    const corpus = articles.items.map((a) => `${a.title} ${a.body}`).join(" ");
    const dropped = llm.dropUnsupportedNumericFacts(extracted.headlines, corpus);
    for (const s of extracted.sections) llm.dropUnsupportedNumericFacts(s.facts, corpus);
    if (dropped) console.log(`[finalize] dropped ${dropped} headline facts w/ unsupported numbers`);
  }

  const master: ReportContent = ReportContentSchema.parse({
    date: reportDate,
    headline_summary: extracted.headline_summary,
    market_summary: {
      indices: quotes,
      movers: extracted.movers ?? { gainers: [], losers: [] },
      macro: extracted.macro ?? [],
      sector_perf: extracted.sector_perf ?? [],
    },
    focus: extracted.focus,
    headlines: extracted.headlines,
    sections: extracted.sections,
    geopolitics: extracted.geopolitics,
  });

  const supabase = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Images (optional; never block the report).
  let cardUrl: string | null = null;
  let coverUrl: string | null = null;
  try {
    const font = await loadFont();
    if (font) {
      cardUrl = await uploadPng(supabase, `cards/${reportDate}.png`, await renderReportCard(master, font));
      const aiPng = await generateAiHeader(master, env.raw);
      const coverPng = aiPng ?? (await renderMoodBanner(master, font));
      console.log(`[finalize] cover: ${aiPng ? "AI header" : "procedural mood banner"}`);
      coverUrl = await uploadPng(supabase, `covers/${reportDate}.png`, coverPng);
    }
  } catch (e) {
    console.warn(`[finalize] image render skipped: ${(e as Error).message}`);
  }

  const { data: saved, error: saveErr } = await supabase
    .from("daily_reports")
    .upsert(
      {
        report_date: reportDate,
        content: master,
        card_image_url: cardUrl,
        cover_image_url: coverUrl,
        status: "ready",
        pipeline_meta: {
          source: "dispatch",
          quotes: quotes.length,
          collected_items: articles?.count ?? null,
          duration_ms: Date.now() - runStart,
        },
      },
      { onConflict: "report_date" },
    )
    .select("id")
    .single();
  if (saveErr) throw saveErr;
  console.log(`[finalize] master report ready (${saved.id})`);

  await fanOutUserReports(supabase, saved.id, reportDate, master);
  console.log(`[finalize] done in ${Date.now() - runStart}ms`);
}

/**
 * Overwrite the focus block's price + recent series with authoritative KIS
 * quotes (SK Hynix etc.). No-op when creds are absent or the focus ticker is
 * not a 6-digit KRX code. Never throws — accuracy is a bonus, not a blocker.
 */
async function enrichFocusWithKis(extracted: { focus?: any }): Promise<void> {
  const creds = kisCredsFromEnv();
  const focus = extracted.focus;
  if (!creds || !focus) return;
  const code = String(focus.ticker ?? "").match(/\d{6}/)?.[0];
  if (!code) return;

  try {
    const token = await getAccessToken(creds);
    const [quote, daily] = await Promise.all([
      getDomesticQuote(creds, token, code),
      getDomesticDaily(creds, token, code, 10).catch(() => []),
    ]);

    const asOf = daily.length ? fmtKisDate(daily[daily.length - 1].date) : "";
    focus.price = {
      value: quote.price,
      currency: "KRW",
      change_pct: quote.changePct,
      change_abs: quote.changeAbs,
      as_of: asOf || focus.price?.as_of || "",
    };
    if (daily.length >= 2) {
      focus.price_series = daily.map((c) => ({ label: fmtKisDate(c.date), value: c.close }));
    }
    console.log(`[finalize] KIS focus ${code}: ₩${quote.price.toLocaleString()} (${quote.changePct}%), ${daily.length} candles`);
  } catch (e) {
    console.warn(`[finalize] KIS enrichment skipped: ${(e as Error).message}`);
  }
}

function fmtKisDate(yyyymmdd: string): string {
  return yyyymmdd.length === 8 ? `${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(6, 8)}` : yyyymmdd;
}

/**
 * Correct the movers' percent moves for US tickers using KIS overseas quotes.
 * Only touches structured movers[]; narrative text is left as authored.
 */
async function enrichMoversWithKis(extracted: {
  movers?: { gainers?: { ticker: string; pct: number }[]; losers?: { ticker: string; pct: number }[] };
}): Promise<void> {
  const creds = kisCredsFromEnv();
  const movers = extracted.movers;
  if (!creds || !movers) return;
  const all = [...(movers.gainers ?? []), ...(movers.losers ?? [])];
  const us = all.filter((m) => /^[A-Z]{1,5}$/.test(m.ticker)); // US symbols only
  if (us.length === 0) return;

  try {
    const token = await getAccessToken(creds);
    let ok = 0;
    for (const m of us) {
      try {
        const q = await getOverseasQuote(creds, token, m.ticker);
        m.pct = q.changePct;
        ok++;
      } catch (e) {
        console.warn(`[finalize] KIS mover ${m.ticker} skipped: ${(e as Error).message}`);
      }
    }
    console.log(`[finalize] KIS movers: ${ok}/${us.length} US tickers anchored`);
  } catch (e) {
    console.warn(`[finalize] KIS movers enrichment skipped: ${(e as Error).message}`);
  }
}

async function fanOutUserReports(
  supabase: SupabaseClient,
  dailyReportId: string,
  reportDate: string,
  master: ReportContent,
) {
  const { data: approved } = await supabase.from("profiles").select("id").eq("is_approved", true);
  if (!approved?.length) {
    console.log("[finalize] no approved users to fan out to");
    return;
  }
  const { data: prefsRows } = await supabase
    .from("preferences")
    .select("user_id, sectors, tickers, topics");
  const prefsById = new Map((prefsRows ?? []).map((p: any) => [p.user_id, p]));

  const rows = approved.map((u: any) => {
    const p = prefsById.get(u.id) ?? { sectors: [], tickers: [], topics: [] };
    return {
      user_id: u.id,
      daily_report_id: dailyReportId,
      report_date: reportDate,
      content: personalizeReport(master, {
        sectors: p.sectors ?? [],
        tickers: p.tickers ?? [],
        topics: p.topics ?? [],
      }),
    };
  });
  const { error } = await supabase
    .from("user_reports")
    .upsert(rows, { onConflict: "user_id,report_date" });
  if (error) console.warn(`[finalize] fan-out error: ${error.message}`);
  else console.log(`[finalize] fanned out to ${rows.length} users`);
}

async function uploadPng(supabase: SupabaseClient, path: string, png: Buffer): Promise<string | null> {
  const up = await supabase.storage
    .from("report-images")
    .upload(path, png, { contentType: "image/png", upsert: true });
  if (up.error) {
    console.warn(`[finalize] upload ${path} failed: ${up.error.message}`);
    return null;
  }
  return supabase.storage.from("report-images").getPublicUrl(path).data.publicUrl;
}

async function loadFont(): Promise<ArrayBuffer | null> {
  const url = "https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Regular.woff";
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

main().catch((e) => {
  console.error("[finalize] failed:", e);
  process.exit(1);
});

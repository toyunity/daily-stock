import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  ReportContentSchema,
  personalizeReport,
  sources,
  llm,
  type ReportContent,
} from "@daily-stock/shared";
import { env, usEasternDate } from "./env";
import { renderReportCard } from "./render";

const FOCUS_TICKERS = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA"];

async function main() {
  const reportDate = usEasternDate();
  const runStart = Date.now();
  console.log(`[pipeline] building report for US session ${reportDate}`);

  const supabase = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Mark building (idempotent upsert by report_date).
  await supabase
    .from("daily_reports")
    .upsert(
      { report_date: reportDate, content: emptyContent(reportDate), status: "building" },
      { onConflict: "report_date" },
    );

  try {
    // 1) Market quotes.
    const indices = await sources.fetchIndexQuotes();
    console.log(`[pipeline] fetched ${indices.length} index quotes`);

    // 2) News / press collection.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { items, errors } = await sources.collectRawItems({
      since,
      tickers: FOCUS_TICKERS,
      env: env.raw,
    });
    console.log(`[pipeline] collected ${items.length} items; ${errors.length} source errors`);
    for (const e of errors) console.warn(`  - source ${e.id}: ${e.message}`);

    // Persist raw items (dedupe by url).
    if (items.length) {
      await supabase.from("raw_items").upsert(
        items.map((it) => ({
          url: it.url,
          source: it.source,
          title: it.title,
          body: it.body,
          tickers: it.tickers ?? null,
          published_at: it.publishedAt,
        })),
        { onConflict: "url", ignoreDuplicates: true },
      );
    }

    // 3) LLM fact extraction + structuring (bounded corpus to control tokens).
    const forPrompt = items.slice(0, 40).map((it) => ({
      title: it.title,
      body: it.body,
      source: it.source,
      url: it.url,
      publishedAt: it.publishedAt,
      tickers: it.tickers,
    }));

    let extracted;
    if (forPrompt.length === 0) {
      extracted = { headline_summary: "No qualifying news items were collected for this session.", headlines: [], sections: [] };
    } else {
      extracted = await llm.extractReport(
        { apiKey: env.anthropicApiKey, model: env.model },
        forPrompt,
        reportDate,
      );
    }

    // Anti-hallucination guardrail over the corpus text.
    const corpus = forPrompt.map((a) => `${a.title} ${a.body}`).join(" ");
    const droppedHead = llm.dropUnsupportedNumericFacts(extracted.headlines, corpus);
    for (const s of extracted.sections) llm.dropUnsupportedNumericFacts(s.facts, corpus);
    if (droppedHead) console.log(`[pipeline] dropped ${droppedHead} headline facts w/ unsupported numbers`);

    // 4) Assemble + validate master content.
    const master: ReportContent = ReportContentSchema.parse({
      date: reportDate,
      headline_summary: extracted.headline_summary,
      market_summary: {
        indices,
        movers: buildMovers(indices),
        macro: [],
      },
      headlines: extracted.headlines,
      sections: extracted.sections,
    });

    // 5) Render shareable card image (optional; never blocks the report).
    let cardUrl: string | null = null;
    try {
      const font = await loadFont();
      if (font) {
        const png = await renderReportCard(master, font);
        const path = `cards/${reportDate}.png`;
        const up = await supabase.storage
          .from("report-images")
          .upload(path, png, { contentType: "image/png", upsert: true });
        if (!up.error) {
          cardUrl = supabase.storage.from("report-images").getPublicUrl(path).data.publicUrl;
        } else {
          console.warn(`[pipeline] card upload failed: ${up.error.message}`);
        }
      }
    } catch (e) {
      console.warn(`[pipeline] card render skipped: ${(e as Error).message}`);
    }

    // 6) Persist master report as ready.
    const { data: saved, error: saveErr } = await supabase
      .from("daily_reports")
      .upsert(
        {
          report_date: reportDate,
          content: master,
          card_image_url: cardUrl,
          status: "ready",
          pipeline_meta: {
            items: items.length,
            source_errors: errors,
            duration_ms: Date.now() - runStart,
          },
        },
        { onConflict: "report_date" },
      )
      .select("id")
      .single();
    if (saveErr) throw saveErr;
    console.log(`[pipeline] master report ready (${saved.id})`);

    // 7) Fan out personalized reports for approved users.
    await fanOutUserReports(supabase, saved.id, reportDate, master);

    console.log(`[pipeline] done in ${Date.now() - runStart}ms`);
  } catch (err) {
    console.error("[pipeline] failed:", err);
    await supabase
      .from("daily_reports")
      .update({ status: "failed", pipeline_meta: { error: String((err as Error).message ?? err) } })
      .eq("report_date", reportDate);
    process.exitCode = 1;
  }
}

async function fanOutUserReports(
  supabase: SupabaseClient,
  dailyReportId: string,
  reportDate: string,
  master: ReportContent,
) {
  const { data: approved } = await supabase
    .from("profiles")
    .select("id")
    .eq("is_approved", true);
  if (!approved?.length) {
    console.log("[pipeline] no approved users to fan out to");
    return;
  }

  const { data: prefsRows } = await supabase
    .from("preferences")
    .select("user_id, sectors, tickers, topics");
  const prefsById = new Map((prefsRows ?? []).map((p: any) => [p.user_id, p]));

  const rows = approved.map((u: any) => {
    const p = prefsById.get(u.id) ?? { sectors: [], tickers: [], topics: [] };
    const content = personalizeReport(master, {
      sectors: p.sectors ?? [],
      tickers: p.tickers ?? [],
      topics: p.topics ?? [],
    });
    return {
      user_id: u.id,
      daily_report_id: dailyReportId,
      report_date: reportDate,
      content,
    };
  });

  const { error } = await supabase
    .from("user_reports")
    .upsert(rows, { onConflict: "user_id,report_date" });
  if (error) console.warn(`[pipeline] fan-out upsert error: ${error.message}`);
  else console.log(`[pipeline] fanned out to ${rows.length} users`);
}

function buildMovers(indices: { name: string; change_pct: number }[]) {
  return { gainers: [], losers: [] };
}

function emptyContent(date: string): ReportContent {
  return ReportContentSchema.parse({
    date,
    headline_summary: "Building…",
    market_summary: { indices: [], movers: { gainers: [], losers: [] }, macro: [] },
    headlines: [],
    sections: [],
  });
}

async function loadFont(): Promise<ArrayBuffer | null> {
  // Fetch a Latin font for Satori at runtime; skip rendering if unavailable.
  const url = "https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Regular.woff";
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

main();

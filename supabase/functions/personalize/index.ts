// Supabase Edge Function (Deno): re-personalize the caller's latest report
// after they change their interests. Runs with the caller's JWT; uses the
// service role only to write the derived user_reports row.
//
// Deno-native and self-contained (personalization logic inlined) to avoid
// cross-runtime import friction with the Node pipeline package.

import { createClient } from "jsr:@supabase/supabase-js@2";

interface Fact {
  fact: string;
  sources: { name: string; url: string }[];
  tickers: string[];
  sector?: string;
  topic: string;
}
interface Section {
  title: string;
  sector?: string;
  facts: Fact[];
  chart?: unknown;
}
interface ReportContent {
  date: string;
  headline_summary: string;
  market_summary: unknown;
  headlines: Fact[];
  sections: Section[];
  neutrality_note: string;
  disclaimer: string;
}
interface Prefs {
  sectors: string[];
  tickers: string[];
  topics: string[];
}

function personalize(master: ReportContent, prefs: Prefs): ReportContent {
  const hasPrefs = prefs.sectors.length || prefs.tickers.length || prefs.topics.length;
  if (!hasPrefs) return master;
  const sectorSet = new Set(prefs.sectors.map((s) => s.toLowerCase()));
  const tickerSet = new Set(prefs.tickers.map((t) => t.toUpperCase()));
  const topicSet = new Set(prefs.topics.map((t) => t.toLowerCase()));
  const matches = (f: Fact): boolean =>
    (f.sector != null && sectorSet.has(f.sector)) ||
    topicSet.has(f.topic) ||
    f.tickers.some((t) => tickerSet.has(t.toUpperCase()));
  const headlines = [...master.headlines].sort((a, b) => Number(matches(b)) - Number(matches(a)));
  const sections = master.sections
    .map((s) => ({ ...s, facts: [...s.facts].sort((a, b) => Number(matches(b)) - Number(matches(a))) }))
    .sort((a, b) => {
      const aRel = a.sector && sectorSet.has(a.sector) ? 1 : 0;
      const bRel = b.sector && sectorSet.has(b.sector) ? 1 : 0;
      return bRel - aRel;
    });
  return { ...master, headlines, sections };
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Identify caller from their JWT.
    const asUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await asUser.auth.getUser();
    if (userErr || !userData.user) {
      return json({ error: "unauthorized" }, 401);
    }
    const userId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceKey);

    // Gate: must be approved.
    const { data: profile } = await admin
      .from("profiles")
      .select("is_approved")
      .eq("id", userId)
      .single();
    if (!profile?.is_approved) return json({ error: "not approved" }, 403);

    // Latest master report.
    const { data: master, error: mErr } = await admin
      .from("daily_reports")
      .select("id, report_date, content, status")
      .eq("status", "ready")
      .order("report_date", { ascending: false })
      .limit(1)
      .single();
    if (mErr || !master) return json({ error: "no report yet" }, 404);

    // Caller preferences.
    const { data: prefs } = await admin
      .from("preferences")
      .select("sectors, tickers, topics")
      .eq("user_id", userId)
      .single();

    const personalized = personalize(master.content as ReportContent, {
      sectors: prefs?.sectors ?? [],
      tickers: prefs?.tickers ?? [],
      topics: prefs?.topics ?? [],
    });

    const { error: upErr } = await admin.from("user_reports").upsert(
      {
        user_id: userId,
        daily_report_id: master.id,
        report_date: master.report_date,
        content: personalized,
      },
      { onConflict: "user_id,report_date" },
    );
    if (upErr) return json({ error: upErr.message }, 500);

    return json({ ok: true, report_date: master.report_date });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

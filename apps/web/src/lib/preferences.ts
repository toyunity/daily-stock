import { supabase } from "./supabase";
import { FUNCTIONS_URL } from "./supabase";
import type { PrefValue } from "../components/PreferenceEditor";

export const EMPTY_PREFS: PrefValue = {
  sectors: [],
  tickers: [],
  topics: [],
  ai_header: false,
};

export async function loadPreferences(userId: string): Promise<PrefValue> {
  const { data } = await supabase
    .from("preferences")
    .select("sectors, tickers, topics, ai_header")
    .eq("user_id", userId)
    .single();
  return {
    sectors: data?.sectors ?? [],
    tickers: data?.tickers ?? [],
    topics: data?.topics ?? [],
    ai_header: data?.ai_header ?? false,
  };
}

export async function savePreferences(userId: string, prefs: PrefValue): Promise<void> {
  const { error } = await supabase.from("preferences").upsert(
    {
      user_id: userId,
      sectors: prefs.sectors,
      tickers: prefs.tickers,
      topics: prefs.topics,
      ai_header: prefs.ai_header,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

/**
 * Ask the edge function to regenerate the caller's latest personalized report.
 * Best-effort and non-blocking: bounded by a short timeout so a missing/slow
 * function can never hang the Save button. The daily pipeline also refreshes it.
 */
export async function repersonalize(): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    await fetch(`${FUNCTIONS_URL}/personalize`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
  } catch {
    /* best-effort; ignore missing function / timeout / network errors */
  }
}

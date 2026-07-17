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

/** Ask the edge function to regenerate the caller's latest personalized report. */
export async function repersonalize(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return;
  await fetch(`${FUNCTIONS_URL}/personalize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
  }).catch(() => {
    /* best-effort; the next daily run will also refresh it */
  });
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

/**
 * Lazy env accessors: required keys are validated only when actually read, so a
 * script that doesn't need a key (e.g. `collect` needs no Supabase/Anthropic key)
 * never fails just by importing this module.
 */
export const env = {
  get supabaseUrl() {
    return required("SUPABASE_URL");
  },
  get serviceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get anthropicApiKey() {
    return required("ANTHROPIC_API_KEY");
  },
  // Optional source keys — adapters skip themselves when absent.
  get finnhubKey() {
    return process.env.FINNHUB_API_KEY;
  },
  get alphaVantageKey() {
    return process.env.ALPHAVANTAGE_API_KEY;
  },
  get model() {
    return process.env.ANTHROPIC_MODEL;
  },
  raw: process.env as Record<string, string | undefined>,
};

/** US/Eastern calendar date — the just-closed session when run at 06:15 KST. */
export function usEasternDate(now = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(now); // YYYY-MM-DD
}

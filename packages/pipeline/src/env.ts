function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  supabaseUrl: required("SUPABASE_URL"),
  serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  anthropicApiKey: required("ANTHROPIC_API_KEY"),
  // Optional source keys — adapters skip themselves when absent.
  finnhubKey: process.env.FINNHUB_API_KEY,
  alphaVantageKey: process.env.ALPHAVANTAGE_API_KEY,
  model: process.env.ANTHROPIC_MODEL, // optional override
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

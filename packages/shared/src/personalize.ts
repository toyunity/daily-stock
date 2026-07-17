import type { ReportContent, Fact, Section } from "./schema";

export interface UserPreferences {
  sectors: string[];
  tickers: string[];
  topics: string[];
}

/**
 * Re-shape the master report for one user's interests. Non-destructive: when a
 * user has no preferences, the full report is returned. Matching facts are
 * surfaced first; nothing relevant is hidden, but relevance is prioritized.
 */
export function personalizeReport(master: ReportContent, prefs: UserPreferences): ReportContent {
  const hasPrefs = prefs.sectors.length || prefs.tickers.length || prefs.topics.length;
  if (!hasPrefs) return master;

  const sectorSet = new Set(prefs.sectors.map((s) => s.toLowerCase()));
  const tickerSet = new Set(prefs.tickers.map((t) => t.toUpperCase()));
  const topicSet = new Set(prefs.topics.map((t) => t.toLowerCase()));

  const matches = (f: Fact): boolean => {
    if (f.sector && sectorSet.has(f.sector)) return true;
    if (topicSet.has(f.topic)) return true;
    if (f.tickers.some((t) => tickerSet.has(t.toUpperCase()))) return true;
    return false;
  };

  const rankHeadlines = [...master.headlines].sort(
    (a, b) => Number(matches(b)) - Number(matches(a)),
  );

  const rankedSections: Section[] = master.sections
    .map((s) => ({
      ...s,
      facts: [...s.facts].sort((a, b) => Number(matches(b)) - Number(matches(a))),
    }))
    .sort((a, b) => {
      const aRel = a.sector && sectorSet.has(a.sector) ? 1 : 0;
      const bRel = b.sector && sectorSet.has(b.sector) ? 1 : 0;
      return bRel - aRel;
    });

  return {
    ...master,
    headlines: rankHeadlines,
    sections: rankedSections,
  };
}

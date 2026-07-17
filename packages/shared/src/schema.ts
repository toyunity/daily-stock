import { z } from "zod";

/**
 * Canonical report schema shared by the pipeline (Edge Function) and the
 * frontend. The LLM is forced to emit JSON matching `ReportContentSchema`;
 * the server validates before persisting, so the frontend can trust the shape.
 */

export const SourceRefSchema = z.object({
  name: z.string(),
  url: z.string().url(),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

export const TopicSchema = z.enum([
  "macro",
  "earnings",
  "fed",
  "ipo",
  "m&a",
  "guidance",
  "regulation",
  "commodities",
  "crypto",
  "other",
]);
export type Topic = z.infer<typeof TopicSchema>;

export const SectorSchema = z.enum([
  "tech",
  "memory",
  "finance",
  "energy",
  "healthcare",
  "consumer",
  "industrials",
  "materials",
  "utilities",
  "realestate",
  "communication",
]);
export type Sector = z.infer<typeof SectorSchema>;

export const IndexQuoteSchema = z.object({
  name: z.string(),
  symbol: z.string(),
  value: z.number(),
  change_pct: z.number(),
  change_abs: z.number(),
});
export type IndexQuote = z.infer<typeof IndexQuoteSchema>;

export const MoverSchema = z.object({
  ticker: z.string(),
  pct: z.number(),
});

export const MacroPointSchema = z.object({
  label: z.string(),
  value: z.number(),
  unit: z.string().default(""),
  change: z.number().default(0),
});

export const ChartSpecSchema = z.object({
  type: z.enum(["bar", "line", "heatmap"]),
  data: z.array(z.record(z.union([z.string(), z.number()]))),
  x: z.string().optional(),
  y: z.string().optional(),
});
export type ChartSpec = z.infer<typeof ChartSpecSchema>;

/** A single extracted, source-attributed fact. Never store facts without sources. */
export const FactSchema = z.object({
  fact: z.string().min(1),
  sources: z.array(SourceRefSchema).min(1),
  tickers: z.array(z.string()).default([]),
  sector: SectorSchema.optional(),
  topic: TopicSchema.default("other"),
});
export type Fact = z.infer<typeof FactSchema>;

export const SectionSchema = z.object({
  title: z.string(),
  sector: SectorSchema.optional(),
  facts: z.array(FactSchema).default([]),
  chart: ChartSpecSchema.optional(),
});
export type Section = z.infer<typeof SectionSchema>;

export const MarketSummarySchema = z.object({
  indices: z.array(IndexQuoteSchema).default([]),
  movers: z
    .object({
      gainers: z.array(MoverSchema).default([]),
      losers: z.array(MoverSchema).default([]),
    })
    .default({ gainers: [], losers: [] }),
  macro: z.array(MacroPointSchema).default([]),
});
export type MarketSummary = z.infer<typeof MarketSummarySchema>;

export const ReportContentSchema = z.object({
  date: z.string(), // ISO date, US market session date
  headline_summary: z.string(), // one-paragraph neutral overview
  market_summary: MarketSummarySchema,
  headlines: z.array(FactSchema).default([]),
  sections: z.array(SectionSchema).default([]),
  neutrality_note: z
    .string()
    .default("정치적 논평은 제거되었으며 모든 항목에 출처가 있습니다."),
  disclaimer: z
    .string()
    .default("본 리포트는 정보 제공 목적이며 투자 권유가 아닙니다."),
});
export type ReportContent = z.infer<typeof ReportContentSchema>;

/** The JSON the LLM is asked to produce during the "structure" step. */
export const LlmReportOutputSchema = z.object({
  headline_summary: z.string(),
  headlines: z.array(FactSchema),
  sections: z.array(SectionSchema),
});
export type LlmReportOutput = z.infer<typeof LlmReportOutputSchema>;

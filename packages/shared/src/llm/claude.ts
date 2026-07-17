import { LlmReportOutputSchema, type LlmReportOutput } from "../schema";
import {
  FACT_EXTRACTION_SYSTEM,
  buildFactExtractionUserPrompt,
  type ArticleForPrompt,
} from "./prompts";

/**
 * Minimal, dependency-free Claude client using the Messages API over fetch, so
 * it runs identically in Node and Deno (Supabase Edge Functions).
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-5"; // cost-efficient default; opus for heavier days

export interface ClaudeOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

interface AnthropicResponse {
  content: { type: string; text?: string }[];
}

async function callClaude(opts: ClaudeOptions, system: string, user: string): Promise<string> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_MODEL,
      max_tokens: opts.maxTokens ?? 4096,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic HTTP ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as AnthropicResponse;
  return data.content.map((c) => c.text ?? "").join("");
}

function extractJson(text: string): unknown {
  // Tolerate fenced code blocks or leading prose; grab the first JSON object.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in LLM output");
  return JSON.parse(candidate.slice(start, end + 1));
}

/**
 * Extract neutral, source-attributed facts and a structured report body.
 * Retries once on schema-validation failure with a corrective nudge.
 */
export async function extractReport(
  opts: ClaudeOptions,
  articles: ArticleForPrompt[],
  marketDateISO: string,
): Promise<LlmReportOutput> {
  const user = buildFactExtractionUserPrompt(articles, marketDateISO);

  for (let attempt = 0; attempt < 2; attempt++) {
    const suffix =
      attempt === 0
        ? ""
        : "\n\nYour previous output failed schema validation. Return ONLY valid JSON matching the schema, with every fact citing a source from the items.";
    const raw = await callClaude(opts, FACT_EXTRACTION_SYSTEM, user + suffix);
    try {
      const parsed = extractJson(raw);
      return LlmReportOutputSchema.parse(parsed);
    } catch (err) {
      if (attempt === 1) throw err;
    }
  }
  throw new Error("unreachable");
}

/**
 * Guardrail: keep only facts whose numeric tokens actually appear in the
 * source corpus. Cheap anti-hallucination pass over the raw article text.
 */
export function dropUnsupportedNumericFacts(
  facts: { fact: string }[],
  corpus: string,
): number {
  const nums = (s: string) => (s.match(/\d[\d,.]*/g) ?? []).map((x) => x.replace(/[,]/g, ""));
  const corpusNums = new Set(nums(corpus));
  let dropped = 0;
  for (let i = facts.length - 1; i >= 0; i--) {
    const fnums = nums(facts[i].fact);
    const unsupported = fnums.filter((n) => n.length >= 3 && !corpusNums.has(n));
    if (unsupported.length > 0) {
      facts.splice(i, 1);
      dropped++;
    }
  }
  return dropped;
}

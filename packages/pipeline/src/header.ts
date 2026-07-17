import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import type { ReportContent } from "@daily-stock/shared";

/**
 * Report header image.
 *
 * Two tiers, both free:
 *  1. `renderMoodBanner` — a procedurally generated SVG->PNG banner that always
 *     works (no network, no key). It encodes the day's market mood as color +
 *     abstract shapes. This is the default cover.
 *  2. `generateAiHeader` — an opt-in AI illustration via a pluggable image API
 *     (default: Pollinations, key-free). Falls back to the mood banner on any
 *     failure so the pipeline never blocks.
 *
 * Guardrails: abstract, text-free, neutral illustration only. Never depict real
 * people, brand logos, or fabricated charts/numbers.
 */

export type Mood = "up" | "down" | "mixed";

export function moodFromReport(content: ReportContent): { mood: Mood; avgPct: number } {
  const idx = content.market_summary.indices;
  if (idx.length === 0) return { mood: "mixed", avgPct: 0 };
  const avg = idx.reduce((s, i) => s + i.change_pct, 0) / idx.length;
  const ups = idx.filter((i) => i.change_pct > 0).length;
  const downs = idx.filter((i) => i.change_pct < 0).length;
  let mood: Mood = "mixed";
  if (avg > 0.15 && ups >= downs) mood = "up";
  else if (avg < -0.15 && downs >= ups) mood = "down";
  return { mood, avgPct: Math.round(avg * 100) / 100 };
}

// Labels are kept ASCII so the (Latin) Satori font renders the card cleanly;
// the Korean UI lives in the web app where the browser handles Korean fonts.
const MOOD_STYLE: Record<Mood, { from: string; to: string; accent: string; label: string; glyph: string }> = {
  up: { from: "#052e1a", to: "#065f46", accent: "#34d399", label: "BULLISH", glyph: "▲" },
  down: { from: "#3b0a0a", to: "#7f1d1d", accent: "#f87171", label: "BEARISH", glyph: "▼" },
  mixed: { from: "#0f172a", to: "#334155", accent: "#38bdf8", label: "MIXED", glyph: "◆" },
};

const WIDTH = 1200;
const HEIGHT = 420;

/** Deterministic seed from the date so re-runs of a day are stable. */
export function seedFromDate(date: string): number {
  let h = 2166136261;
  for (let i = 0; i < date.length; i++) {
    h ^= date.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 100000;
}

export async function renderMoodBanner(
  content: ReportContent,
  fontData: ArrayBuffer,
): Promise<Buffer> {
  const { mood, avgPct } = moodFromReport(content);
  const s = MOOD_STYLE[mood];
  const seed = seedFromDate(content.date);

  // A few deterministic abstract circles for visual texture.
  const blobs = Array.from({ length: 5 }, (_, i) => {
    const r = 90 + ((seed >> (i * 2)) % 120);
    const cx = ((seed * (i + 3)) % WIDTH);
    const cy = ((seed * (i + 7)) % HEIGHT);
    return {
      type: "div",
      props: {
        style: {
          position: "absolute",
          left: `${cx - r}px`,
          top: `${cy - r}px`,
          width: `${r * 2}px`,
          height: `${r * 2}px`,
          borderRadius: "9999px",
          background: s.accent,
          opacity: 0.08 + (i % 3) * 0.03,
        },
      },
    };
  });

  const node = {
    type: "div",
    props: {
      style: {
        position: "relative",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: `${WIDTH}px`,
        height: `${HEIGHT}px`,
        padding: "56px",
        overflow: "hidden",
        backgroundImage: `linear-gradient(135deg, ${s.from} 0%, ${s.to} 100%)`,
        color: "#f8fafc",
        fontFamily: "Inter",
      },
      children: [
        ...blobs,
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column" },
            children: [
              { type: "div", props: { style: { fontSize: "26px", color: "rgba(248,250,252,0.7)" }, children: "Daily Stock Report" } },
              { type: "div", props: { style: { fontSize: "64px", fontWeight: 700, marginTop: "6px" }, children: content.date } },
            ],
          },
        },
        {
          type: "div",
          props: {
            style: { display: "flex", alignItems: "center", gap: "16px" },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "10px 20px",
                    borderRadius: "9999px",
                    background: "rgba(255,255,255,0.12)",
                    fontSize: "30px",
                    fontWeight: 600,
                    color: s.accent,
                  },
                  children: `${s.glyph} ${s.label}`,
                },
              },
              {
                type: "div",
                props: {
                  style: { fontSize: "28px", color: "rgba(248,250,252,0.85)" },
                  children: `Avg ${avgPct >= 0 ? "+" : ""}${avgPct.toFixed(2)}%`,
                },
              },
            ],
          },
        },
      ],
    },
  };

  const svg = await satori(node as never, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [{ name: "Inter", data: fontData, weight: 400, style: "normal" }],
  });
  return Buffer.from(new Resvg(svg, { fitTo: { mode: "width", value: WIDTH } }).render().asPng());
}

/**
 * Opt-in AI illustration. Returns PNG bytes or null on any failure/disabled.
 * Provider is pluggable via IMAGE_API_URL (a GET template with placeholders
 * {prompt} {width} {height} {seed}); defaults to key-free Pollinations.
 */
export async function generateAiHeader(
  content: ReportContent,
  env: Record<string, string | undefined>,
): Promise<Buffer | null> {
  if (String(env.AI_HEADER_ENABLED).toLowerCase() !== "true") return null;

  const { mood } = moodFromReport(content);
  const seed = seedFromDate(content.date);
  const moodWord = mood === "up" ? "optimistic rising" : mood === "down" ? "somber declining" : "balanced mixed";

  // Abstract, text-free, neutral. No people, brands, or fabricated data.
  const prompt =
    `abstract minimalist financial market illustration, ${moodWord} mood, ` +
    `flowing gradient shapes, soft geometric forms, editorial banner, ` +
    `no text, no words, no logos, no people, no charts with numbers, clean modern`;

  const template =
    env.IMAGE_API_URL ??
    "https://image.pollinations.ai/prompt/{prompt}?width={width}&height={height}&seed={seed}&nologo=true";

  const url = template
    .replace("{prompt}", encodeURIComponent(prompt))
    .replace("{width}", String(WIDTH))
    .replace("{height}", String(HEIGHT))
    .replace("{seed}", String(seed));

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    const headers: Record<string, string> = {};
    if (env.IMAGE_API_KEY) headers["Authorization"] = `Bearer ${env.IMAGE_API_KEY}`;
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 1000 ? buf : null;
  } catch {
    return null;
  }
}

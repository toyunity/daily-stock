import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import type { ReportContent } from "@daily-stock/shared";

/**
 * Render a shareable report card (1080x1350 PNG) from the report content using
 * Satori (JSX-as-object -> SVG) + resvg (SVG -> PNG). Font-free rendering is not
 * supported by Satori, so a font buffer must be supplied by the caller.
 */

export async function renderReportCard(
  content: ReportContent,
  fontData: ArrayBuffer,
): Promise<Buffer> {
  const up = "#16a34a";
  const down = "#dc2626";
  const indices = content.market_summary.indices.slice(0, 4);
  const topHeadlines = content.headlines.slice(0, 4);

  const node = {
    type: "div",
    props: {
      style: {
        display: "flex",
        flexDirection: "column",
        width: "1080px",
        height: "1350px",
        padding: "64px",
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
        color: "#f8fafc",
        fontFamily: "Inter",
      },
      children: [
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", marginBottom: "40px" },
            children: [
              { type: "div", props: { style: { fontSize: "28px", color: "#94a3b8" }, children: "Daily Stock Report" } },
              { type: "div", props: { style: { fontSize: "56px", fontWeight: 700, marginTop: "8px" }, children: content.date } },
            ],
          },
        },
        {
          type: "div",
          props: {
            style: { display: "flex", flexWrap: "wrap", gap: "20px", marginBottom: "40px" },
            children: indices.map((idx) => ({
              type: "div",
              props: {
                style: {
                  display: "flex",
                  flexDirection: "column",
                  width: "440px",
                  padding: "24px",
                  background: "rgba(255,255,255,0.06)",
                  borderRadius: "16px",
                },
                children: [
                  { type: "div", props: { style: { fontSize: "26px", color: "#cbd5e1" }, children: idx.name } },
                  { type: "div", props: { style: { fontSize: "40px", fontWeight: 700 }, children: idx.value.toLocaleString() } },
                  {
                    type: "div",
                    props: {
                      style: { fontSize: "28px", color: idx.change_pct >= 0 ? up : down },
                      children: `${idx.change_pct >= 0 ? "▲" : "▼"} ${idx.change_pct.toFixed(2)}%`,
                    },
                  },
                ],
              },
            })),
          },
        },
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", gap: "18px", flex: 1 },
            children: topHeadlines.map((h) => ({
              type: "div",
              props: {
                style: { display: "flex", fontSize: "28px", lineHeight: 1.35, color: "#e2e8f0" },
                children: `• ${truncate(h.fact, 120)}`,
              },
            })),
          },
        },
        {
          type: "div",
          props: {
            // ASCII chrome: the Satori font is Latin-only. Korean UI lives in the app.
            style: { fontSize: "22px", color: "#64748b", marginTop: "24px" },
            children: "For information only. Not investment advice.",
          },
        },
      ],
    },
  };

  const svg = await satori(node as never, {
    width: 1080,
    height: 1350,
    fonts: [{ name: "Inter", data: fontData, weight: 400, style: "normal" }],
  });

  const png = new Resvg(svg, { fitTo: { mode: "width", value: 1080 } }).render().asPng();
  return Buffer.from(png);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

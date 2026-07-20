import { describe, it, expect } from "vitest";
import { FactSchema, LlmReportOutputSchema } from "./schema";

describe("FactSchema", () => {
  it("sources가 빈 배열이면 거부한다", () => {
    const r = FactSchema.safeParse({ fact: "테스트", sources: [] });
    expect(r.success).toBe(false);
  });

  it("url이 URL 형식이 아니면 거부한다", () => {
    const r = FactSchema.safeParse({
      fact: "테스트",
      sources: [{ name: "출처", url: "not-a-url" }],
    });
    expect(r.success).toBe(false);
  });

  it("tickers와 topic에 기본값을 채운다", () => {
    const r = FactSchema.parse({
      fact: "테스트",
      sources: [{ name: "출처", url: "https://example.com/a" }],
    });
    expect(r.tickers).toEqual([]);
    expect(r.topic).toBe("other");
  });
});

describe("LlmReportOutputSchema", () => {
  const minimal = { headline_summary: "요약", headlines: [], sections: [] };

  it("최소 필수 필드만으로 통과한다", () => {
    expect(LlmReportOutputSchema.safeParse(minimal).success).toBe(true);
  });

  it("headline_summary가 없으면 거부한다", () => {
    const { headline_summary, ...rest } = minimal;
    expect(LlmReportOutputSchema.safeParse(rest).success).toBe(false);
  });

  it("headlines가 없으면 거부한다", () => {
    const { headlines, ...rest } = minimal;
    expect(LlmReportOutputSchema.safeParse(rest).success).toBe(false);
  });
});

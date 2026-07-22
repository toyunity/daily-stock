import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getKisTokenCached, enrichMoversWithKis, enrichIndicesWithKis, focusPriceFromKis } from "./finalize";
import * as kis from "./kis";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "__fixtures__/kis");
// The real captured daily candles for SK Hynix; last two are 20260720 (1,764,000)
// and 20260716 (1,842,000) → a true -78,000 / -4.23% last-session move. kis is
// mocked below but the factory spreads `...actual`, so parseDomesticDaily is real.
function hynixCandles() {
  const raw = JSON.parse(readFileSync(resolve(FIXTURES, "domestic-daily-000660.json"), "utf8"));
  return kis.parseDomesticDaily(raw.output, 10);
}

// Real ESM namespace objects are not extensible, so vi.spyOn cannot patch them.
// vi.mock is hoisted above the imports and replaces the module for the whole file.
vi.mock("./kis", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./kis")>();
  return {
    ...actual,
    issueAccessToken: vi.fn(),
    getOverseasQuote: vi.fn(),
    getOverseasIndex: vi.fn(),
  };
});

const mocked = vi.mocked(kis);
const CREDS = { appkey: "k", appsecret: "s" };

/** Minimal stand-in for the supabase-js chain finalize uses. */
function fakeSupabase(opts: {
  readData?: unknown;
  readError?: { message: string } | null;
  writeError?: { message: string } | null;
}) {
  const upsert = vi.fn().mockResolvedValue({ error: opts.writeError ?? null });
  return {
    upsert,
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: opts.readData ?? null,
            error: opts.readError ?? null,
          }),
        }),
      }),
      upsert,
    }),
  };
}

describe("getKisTokenCached", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocked.issueAccessToken.mockResolvedValue({ token: "FRESH", expiresIn: 86400 });
    vi.spyOn(console, "log").mockImplementation(() => {});
    // Keep a handle on the spy (instead of discarding it) so tests can assert
    // that a warning was actually emitted, not just that it was silenced.
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("캐시가 충분히 남아 있으면 재사용하고 발급하지 않는다", async () => {
    const sb = fakeSupabase({
      readData: {
        value: {
          access_token: "CACHED",
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
        },
      },
    });
    const token = await getKisTokenCached(CREDS, sb as never);
    expect(token).toBe("CACHED");
    expect(mocked.issueAccessToken).not.toHaveBeenCalled();
  });

  it("만료가 5분 이내로 임박하면 재발급한다", async () => {
    const sb = fakeSupabase({
      readData: {
        value: {
          access_token: "CACHED",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
      },
    });
    const token = await getKisTokenCached(CREDS, sb as never);
    expect(token).toBe("FRESH");
    expect(mocked.issueAccessToken).toHaveBeenCalledOnce();
  });

  it("캐시 읽기가 실패하면 유효한 캐시가 있어도 무시하고 재발급한다", async () => {
    // A valid, non-expired cached token sits behind the read error. If the
    // error branch were skipped, this cached token would be returned — so
    // asserting we get the freshly-issued token instead actually proves the
    // read error was detected (not just that it was non-fatal).
    const sb = fakeSupabase({
      readData: {
        value: {
          access_token: "CACHED",
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
        },
      },
      readError: { message: "relation does not exist" },
    });
    const token = await getKisTokenCached(CREDS, sb as never);
    expect(token).toBe("FRESH");
    expect(mocked.issueAccessToken).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("READ error"));
  });

  it("캐시 쓰기가 실패해도 토큰은 반환하고 경고를 남긴다", async () => {
    const sb = fakeSupabase({ writeError: { message: "permission denied" } });
    const token = await getKisTokenCached(CREDS, sb as never);
    expect(token).toBe("FRESH");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("WRITE FAILED"));
  });
});

describe("enrichMoversWithKis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("미국 티커만 앵커링하고 한국 코드는 건드리지 않는다", async () => {
    mocked.getOverseasQuote.mockResolvedValue({
      symbol: "MU", exchange: "NAS", price: 98.5, changeAbs: -4.3, changePct: -4.2,
    });
    const report = {
      movers: {
        gainers: [{ ticker: "MU", pct: 0 }],
        losers: [{ ticker: "000660.KS", pct: -11.53 }],
      },
    };
    await enrichMoversWithKis(report, CREDS, "TOKEN");
    expect(report.movers.gainers[0].pct).toBe(-4.2);
    expect(report.movers.losers[0].pct).toBe(-11.53); // 정규식에 걸러져 그대로
    expect(mocked.getOverseasQuote).toHaveBeenCalledOnce();
  });

  it("개별 티커 실패가 나머지를 막지 않는다", async () => {
    mocked.getOverseasQuote
      .mockRejectedValueOnce(new Error("not found"))
      .mockResolvedValueOnce({
        symbol: "AMD", exchange: "NAS", price: 200, changeAbs: -8, changePct: -4.1,
      });
    const report = { movers: { gainers: [{ ticker: "XXXX", pct: 0 }, { ticker: "AMD", pct: 0 }], losers: [] } };
    await enrichMoversWithKis(report, CREDS, "TOKEN");
    expect(report.movers.gainers[1].pct).toBe(-4.1);
  });

  it("movers가 없으면 아무 것도 하지 않는다", async () => {
    mocked.getOverseasQuote.mockResolvedValue({} as never);
    await enrichMoversWithKis({}, CREDS, "TOKEN");
    expect(mocked.getOverseasQuote).not.toHaveBeenCalled();
  });
});

describe("enrichIndicesWithKis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("매핑된 심볼만 덮어쓰고 코스피는 리서치값을 유지한다", async () => {
    mocked.getOverseasIndex.mockResolvedValue({
      code: "SPX", value: 7457.69, changeAbs: -76.1, changePct: -1.01,
    });
    const report = {
      indices: [
        { name: "S&P 500", symbol: "^GSPC", value: 0, change_pct: 0, change_abs: 0 },
        { name: "코스피", symbol: "^KS11", value: 6820.6, change_pct: -6.37, change_abs: -463.81 },
      ],
    };
    await enrichIndicesWithKis(report, CREDS, "TOKEN");
    expect(report.indices[0].value).toBe(7457.69);
    expect(report.indices[1].value).toBe(6820.6); // KIS_INDEX_CODE에 없음
    expect(mocked.getOverseasIndex).toHaveBeenCalledOnce();
    expect(mocked.getOverseasIndex).toHaveBeenCalledWith(CREDS, "TOKEN", "SPX");
  });

  it("점(.)으로 시작하는 코드(다우)를 그대로 전달한다", async () => {
    mocked.getOverseasIndex.mockResolvedValue({
      code: ".DJI", value: 44910.65, changeAbs: -231.49, changePct: -0.51,
    });
    const report = {
      indices: [{ name: "다우", symbol: "^DJI", value: 0, change_pct: 0, change_abs: 0 }],
    };
    await enrichIndicesWithKis(report, CREDS, "TOKEN");
    expect(report.indices[0].value).toBe(44910.65);
    expect(mocked.getOverseasIndex).toHaveBeenCalledWith(CREDS, "TOKEN", ".DJI");
  });

  it("개별 지수 실패가 나머지를 막지 않는다", async () => {
    mocked.getOverseasIndex
      .mockRejectedValueOnce(new Error("unparseable"))
      .mockResolvedValueOnce({ code: "SPX", value: 7457.69, changeAbs: -76.1, changePct: -1.01 });
    const report = {
      indices: [
        { name: "VIX", symbol: "^VIX", value: 18.53, change_pct: 10.76, change_abs: 1.8 },
        { name: "S&P 500", symbol: "^GSPC", value: 0, change_pct: 0, change_abs: 0 },
      ],
    };
    await enrichIndicesWithKis(report, CREDS, "TOKEN");
    expect(report.indices[0].value).toBe(18.53); // 실패 → 리서치값 유지
    expect(report.indices[1].value).toBe(7457.69);
  });
});

describe("focusPriceFromKis", () => {
  it("개장 전 스폿이 0%여도 일별 봉으로 실제 등락을 계산한다", () => {
    // 정규 스케줄(05:50 KST)은 KRX 개장 전이라 getDomesticQuote 가 전일 종가를
    // 현재가로, 등락을 0% 로 준다. 진짜 직전 세션 등락은 일별 봉에서 나와야 한다.
    const preMarketSpot = { price: 1764000, changeAbs: 0, changePct: 0 };
    const p = focusPriceFromKis(preMarketSpot, hynixCandles());
    expect(p.change_pct).toBe(-4.23); // 스폿의 0% 가 아니라 봉 기반 실제값
    expect(p.change_abs).toBe(-78000);
    expect(p.value).toBe(1764000);
    expect(p.as_of).toBe("07/20");
  });

  it("봉이 있으면 스폿 값을 완전히 무시한다", () => {
    const bogusSpot = { price: 999, changeAbs: 999, changePct: 999 };
    const p = focusPriceFromKis(bogusSpot, hynixCandles());
    expect(p.value).toBe(1764000);
    expect(p.change_pct).toBe(-4.23);
  });

  it("봉이 2개 미만이면 스폿 값으로 폴백한다", () => {
    const spot = { price: 1764000, changeAbs: -78000, changePct: -4.23 };
    const p = focusPriceFromKis(spot, []);
    expect(p.value).toBe(1764000);
    expect(p.change_pct).toBe(-4.23);
    expect(p.change_abs).toBe(-78000);
  });
});

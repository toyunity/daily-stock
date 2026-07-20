import { describe, it, expect } from "vitest";
import {
  shouldDumpResponse,
  parseDomesticQuote,
  parseDomesticDaily,
  parseOverseasQuote,
  parseOverseasIndex,
} from "./kis";

describe("shouldDumpResponse", () => {
  it("토큰 발급 응답은 덤프하지 않는다 — access_token이 들어 있다", () => {
    expect(shouldDumpResponse("https://openapi.koreainvestment.com:9443/oauth2/tokenP")).toBe(false);
  });

  it("시세 엔드포인트는 덤프한다", () => {
    expect(
      shouldDumpResponse(
        "https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price?FID_INPUT_ISCD=000660",
      ),
    ).toBe(true);
  });

  it("경로에 oauth2가 포함되면 어떤 형태든 거부한다", () => {
    expect(shouldDumpResponse("https://example.com/v1/oauth2/anything")).toBe(false);
  });
});

describe("parseDomesticQuote", () => {
  const base = { stck_prpr: "1842000", prdy_vrss: "240000", prdy_ctrt: "11.53" };

  it("sign이 5(하락)면 등락을 음수로 만든다", () => {
    const q = parseDomesticQuote({ ...base, prdy_vrss_sign: "5" }, "000660");
    expect(q.price).toBe(1842000);
    expect(q.changeAbs).toBe(-240000);
    expect(q.changePct).toBe(-11.53);
  });

  it("sign이 4(하한)도 음수로 만든다", () => {
    const q = parseDomesticQuote({ ...base, prdy_vrss_sign: "4" }, "000660");
    expect(q.changePct).toBe(-11.53);
  });

  it("sign이 2(상승)면 양수를 유지한다", () => {
    const q = parseDomesticQuote({ ...base, prdy_vrss_sign: "2" }, "000660");
    expect(q.changeAbs).toBe(240000);
    expect(q.changePct).toBe(11.53);
  });

  it("KIS가 절댓값을 주므로 sign이 없으면 양수로 본다", () => {
    const q = parseDomesticQuote({ ...base, prdy_vrss_sign: "3" }, "000660");
    expect(q.changePct).toBe(11.53);
  });

  it("output이 비면 code를 담아 throw한다", () => {
    expect(() => parseDomesticQuote(undefined, "000660")).toThrow("000660");
  });
});

describe("parseDomesticDaily", () => {
  // KIS returns newest-first.
  const rows = [
    { stck_bsop_date: "20260716", stck_clpr: "1842000" },
    { stck_bsop_date: "20260715", stck_clpr: "2082000" },
    { stck_bsop_date: "20260714", stck_clpr: "1959000" },
  ];

  it("newest-first를 oldest-first로 뒤집는다", () => {
    const c = parseDomesticDaily(rows, 10);
    expect(c.map((x) => x.date)).toEqual(["20260714", "20260715", "20260716"]);
  });

  it("limit을 적용하되 최신 쪽을 남긴다", () => {
    const c = parseDomesticDaily(rows, 2);
    expect(c.map((x) => x.date)).toEqual(["20260715", "20260716"]);
  });

  it("종가나 날짜가 없는 행은 버린다", () => {
    const c = parseDomesticDaily([...rows, { stck_bsop_date: "20260717", stck_clpr: "" }], 10);
    expect(c).toHaveLength(3);
  });

  it("rows가 undefined면 빈 배열을 준다", () => {
    expect(parseDomesticDaily(undefined, 10)).toEqual([]);
  });
});

describe("parseOverseasQuote", () => {
  it("sign이 5면 등락을 음수로 만든다", () => {
    const q = parseOverseasQuote({ last: "98.5", diff: "4.3", rate: "4.2", sign: "5" }, "MU", "NAS");
    expect(q).not.toBeNull();
    expect(q!.price).toBe(98.5);
    expect(q!.changeAbs).toBe(-4.3);
    expect(q!.changePct).toBe(-4.2);
    expect(q!.exchange).toBe("NAS");
  });

  it("sign이 2면 양수를 유지한다", () => {
    const q = parseOverseasQuote({ last: "98.5", diff: "4.3", rate: "4.2", sign: "2" }, "MU", "NAS");
    expect(q!.changePct).toBe(4.2);
  });

  it("last가 0이면 null — 다음 거래소를 시도해야 한다", () => {
    expect(parseOverseasQuote({ last: "0" }, "MU", "NAS")).toBeNull();
  });

  it("output이 없으면 null", () => {
    expect(parseOverseasQuote(undefined, "MU", "NAS")).toBeNull();
  });

  it("last가 숫자가 아니면 null", () => {
    expect(parseOverseasQuote({ last: "" }, "MU", "NAS")).toBeNull();
  });

  it("last가 파싱 불가능한 문자열(NaN)이면 null", () => {
    expect(parseOverseasQuote({ last: "abc" }, "MU", "NAS")).toBeNull();
  });
});

describe("parseOverseasIndex", () => {
  it("output1이 정상이면 그것을 쓴다", () => {
    const i = parseOverseasIndex(
      {
        output1: {
          ovrs_nmix_prpr: "7457.69",
          ovrs_nmix_prdy_vrss: "76.1",
          prdy_ctrt: "1.01",
          prdy_vrss_sign: "5",
        },
      },
      "SPX",
    );
    expect(i.value).toBe(7457.69);
    expect(i.changeAbs).toBe(-76.1);
    expect(i.changePct).toBe(-1.01);
  });

  it("output1이 비면 output2에서 파생한다 — newest-first 가정", () => {
    const i = parseOverseasIndex(
      { output2: [{ ovrs_nmix_prpr: "110" }, { ovrs_nmix_prpr: "100" }] },
      "SPX",
    );
    expect(i.value).toBe(110);
    expect(i.changeAbs).toBe(10);
    expect(i.changePct).toBe(10);
  });

  it("output1의 현재가가 0이면 output2로 넘어간다", () => {
    const i = parseOverseasIndex(
      {
        output1: { ovrs_nmix_prpr: "0" },
        output2: [{ ovrs_nmix_prpr: "110" }, { ovrs_nmix_prpr: "100" }],
      },
      "SPX",
    );
    expect(i.value).toBe(110);
  });

  it("output1의 현재가는 정상이지만 등락 필드가 없어 NaN이면 output2로 넘어간다", () => {
    const i = parseOverseasIndex(
      {
        // Valid, non-zero current price — passes the OUTER guard — but no
        // change fields at all, so the computed abs/pct are NaN and must
        // fail the INNER finite check, falling through to the series.
        output1: { ovrs_nmix_prpr: "999" },
        output2: [{ ovrs_nmix_prpr: "220" }, { ovrs_nmix_prpr: "200" }],
      },
      "SPX",
    );
    // These values (220/20/10) are only reachable via the output2 series —
    // output1's current price is 999, so exit-1-unconditionally would fail this.
    expect(i.value).toBe(220);
    expect(i.changeAbs).toBe(20);
    expect(i.changePct).toBe(10);
    expect(Number.isFinite(i.value)).toBe(true);
    expect(Number.isFinite(i.changeAbs)).toBe(true);
    expect(Number.isFinite(i.changePct)).toBe(true);
  });

  it("둘 다 못 쓰면 진단용 키 목록을 담아 throw한다", () => {
    // .VIX의 실제 실패 형태: output1은 오지만 값이 비어 있고 output2가 없다.
    expect(() =>
      parseOverseasIndex({ output1: { acml_vol: "0", ovrs_nmix_prpr: "" }, output2: [] }, ".VIX"),
    ).toThrow(/\.VIX.*acml_vol/s);
  });

  it("output2가 1개뿐이면 등락을 계산할 수 없어 throw한다", () => {
    expect(() => parseOverseasIndex({ output2: [{ ovrs_nmix_prpr: "110" }] }, "SPX")).toThrow();
  });
});

import { describe, it, expect } from "vitest";
import { shouldDumpResponse, parseDomesticQuote } from "./kis";

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

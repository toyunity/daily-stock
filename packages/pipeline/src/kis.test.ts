import { describe, it, expect } from "vitest";
import { shouldDumpResponse } from "./kis";

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

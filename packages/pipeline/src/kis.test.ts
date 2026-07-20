import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseDomesticQuote,
  parseDomesticDaily,
  parseOverseasQuote,
  parseOverseasIndex,
} from "./kis";

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
    expect(q!.changeAbs).toBe(4.3);
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

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "__fixtures__/kis");

function fixture(name: string): any {
  const p = resolve(FIXTURES, name);
  // A missing fixture must fail loudly — silently skipping would let the suite
  // pass while testing nothing.
  if (!existsSync(p)) throw new Error(`fixture missing: ${p}`);
  return JSON.parse(readFileSync(p, "utf8"));
}

describe("실물 KIS 응답 (픽스처)", () => {
  it("국내 현재가를 파싱한다", () => {
    const q = parseDomesticQuote(fixture("domestic-quote-000660.json").output, "000660");
    // 실물 페이로드는 prdy_vrss/prdy_ctrt가 이미 부호를 포함해서 온다("-78000",
    // "-4.23") — 그래서 이 정확값 비교는 부호 로직 자체를 가르지는 않는다(둘 다
    // 음수이므로 sign 처리를 생략해도 우연히 같은 결과가 나올 수 있음). 부호
    // 로직(양의 magnitude를 sign 필드로 뒤집는 것)은 위 parseDomesticQuote
    // describe 블록의 인라인 테스트가 계속 담당한다. 여기서는 필드명이 바뀌면
    // 반드시 깨지도록 실물 캡처값 자체를 정확히 고정한다.
    expect(q.price).toBe(1764000);
    expect(q.changeAbs).toBe(-78000);
    expect(q.changePct).toBe(-4.23);
  });

  it("국내 일별봉을 oldest-first로 파싱한다", () => {
    const c = parseDomesticDaily(fixture("domestic-daily-000660.json").output, 10);
    expect(c.every((x) => x.close > 0)).toBe(true);
    expect(Number(c[0].date)).toBeLessThan(Number(c[c.length - 1].date));
    // slice(-limit)과 slice(0, limit) 둘 다 "oldest-first"이고 길이 조건도 같이
    // 통과할 수 있다 — 어느 쪽 끝을 남겼는지까지 고정해야 잘못된 쪽을 남기는
    // 회귀를 잡는다. 픽스처는 30개 행을 담고 있으므로 limit=10일 때 최신 쪽을
    // 남겼다면 마지막 캔들 날짜가 반드시 원본의 최신 날짜(20260720)와 같아야 한다.
    expect(c).toHaveLength(10);
    expect(c[c.length - 1].date).toBe("20260720");
  });

  it("해외 현재가를 파싱한다", () => {
    const q = parseOverseasQuote(fixture("overseas-quote-MU-NAS.json").output, "MU", "NAS");
    expect(q).not.toBeNull();
    expect(q!.price).toBe(867.2185);
    expect(q!.changeAbs).toBe(18.2685);
    expect(q!.changePct).toBe(2.15);
  });

  it("해외지수 SPX를 output1 경로로 파싱한다", () => {
    const i = parseOverseasIndex(fixture("overseas-index-SPX.json"), "SPX");
    expect(i.value).toBe(7457.69);
    expect(i.changeAbs).toBe(-76.08);
    expect(i.changePct).toBe(-1.01);
  });

  // 지금까지 어떤 테스트에서도 쓰이지 않던 픽스처다. SPX와 같은 스타일로
  // 정확값을 고정해 필드명 변경을 잡는다.
  it("해외지수 COMP(나스닥 종합)를 output1 경로로 파싱한다", () => {
    const i = parseOverseasIndex(fixture("overseas-index-COMP.json"), "COMP");
    expect(i.value).toBe(25520.24);
    expect(i.changeAbs).toBe(-361.71);
    expect(i.changePct).toBe(-1.4);
  });

  // .DJI는 코드에 점(.)이 붙는 다우존스 지수다. 이 테스트가 정직하게 확인할 수
  // 있는 것은 output1 경로로 파싱된 값이 실물 캡처와 일치하고, 점 접두사 코드
  // 문자열이 그대로 보존되어 반환된다는 것뿐이다 — parseOverseasIndex는 code
  // 인자의 점 접두사로 분기하지 않는다(코드는 반환값과 throw 메시지에 그대로
  // echo될 뿐). 점 접두사 코드(.DJI/.VIX)→심볼 매핑 자체(과거 실물 버그, 1ee6d99
  // 에서 수정)를 지키는 회귀 가드는 finalize.ts의 SYMBOL-TO-CODE MAPPING이고,
  // 그 가드는 이 파일이 아니라 finalize.test.ts가 담당한다.
  it("해외지수 .DJI(점 접두사)를 파싱하면 코드가 그대로 보존된다", () => {
    const i = parseOverseasIndex(fixture("overseas-index-dot-DJI.json"), ".DJI");
    expect(i.code).toBe(".DJI");
    expect(i.value).toBe(52146.42);
    expect(i.changeAbs).toBe(-406.55);
    expect(i.changePct).toBe(-0.77);
  });

  // exit 2(output2 시계열 파생)는 실물 픽스처로 덮을 수 없다 — 정상 심볼은 exit 1,
  // .VIX는 output1/output2가 모두 비어 exit 3으로 간다. spec §4.2 정정 참조.
  // 해당 경로는 위쪽 인라인 테스트가 계속 담당한다.
  it(".VIX는 여전히 파싱 불가이며 진단 정보를 담아 throw한다", () => {
    // 코드 문자열만 메시지에 들어있는지가 아니라, 실물 캡처의 output1 키 이름이
    // 진단 메시지에 실제로 등장하는지까지 확인한다 — 그렇지 않으면 이 픽스처를
    // {}로 바꿔도(즉 아무 진단 정보도 없어도) 이 테스트는 여전히 통과해서,
    // 픽스처가 아무것도 검증하지 않는 셈이 된다. 위쪽 인라인 테스트와 같은
    // 방식(.toThrow(/…/s)으로 순서대로 여러 키를 매칭)을 쓴다.
    expect(() => parseOverseasIndex(fixture("overseas-index-dot-VIX.json"), ".VIX")).toThrow(
      /\.VIX.*ovrs_nmix_prdy_vrss.*acml_vol.*ovrs_nmix_prpr/s,
    );
  });
});

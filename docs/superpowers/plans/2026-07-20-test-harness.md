# 테스트 하네스 + CI 게이트 구현 계획 (하네스 A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `kis.ts`의 응답 파싱 로직을 순수 함수로 분리하고, vitest 기반 테스트와 CI 게이트를 붙여 이 프로젝트가 실제로 겪은 버그 유형(외부 응답 파싱)을 회귀로부터 보호한다.

**Architecture:** `kis.ts`의 각 `get*` 함수에서 파싱부를 `parse*` 순수 함수로 추출한다. `fetch` 모킹 없이 픽스처 객체만으로 파싱을 검증할 수 있게 된다. 외부 시그니처는 불변이므로 `finalize.ts`는 수정하지 않는다. 별도 `ci.yml`이 push마다 typecheck + test를 돌리되, `finalize.yml`과는 완전히 독립이다.

**Tech Stack:** vitest 2.x · TypeScript 5.5 · npm workspaces · GitHub Actions

## Global Constraints

- 대상 브랜치는 **`claude/stock-market-report-app-9to46d`** 하나뿐이다. 다른 브랜치를 만들지 않는다.
- **`reports/report.json`을 절대 수정하지 않는다.** 수정 후 push하면 `finalize.yml`이 발화해 KIS 토큰을 소모하고 Supabase의 오늘자 행을 덮어쓴다.
- `finalize.ts` · `render.ts` · `header.ts` · `env.ts` · `validate.ts`는 이 계획에서 수정하지 않는다. 유일한 예외는 Task 7(테스트 추가 목적으로 `getKisTokenCached`를 export)이다.
- `kis.ts` 리팩토링은 **동작을 바꾸지 않는다.** 기존의 이상해 보이는 표현(`Math.abs(rate || 0)` 등)도 그대로 옮긴다. 개선은 이 계획의 범위가 아니다.
- 커밋 메시지는 영문, 마지막 줄에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Node 22, npm workspaces 루트에서 실행.

## 2단계 구성 — 시간 제약

픽스처를 **실물로 캡처**해야 하므로(spec §3) 구현이 두 시점으로 갈린다.

| | 시점 | 범위 |
|---|---|---|
| **Phase 1** | 오늘, **20:50 UTC 이전** | Task 1–8. 덤프 훅이 오늘 밤 루틴 실행 전에 origin에 올라가 있어야 한다 |
| **Phase 2** | 내일 아침 (루틴 실행 후) | Task 9. 실물 픽스처 커밋 + 픽스처 기반 테스트 + 덤프 훅 제거 |

**Task 2는 마감이 있다.** 20:50 UTC까지 push되지 않으면 오늘 밤 캡처 기회를 놓치고 Phase 2가 하루 밀린다.

Phase 1의 테스트는 **인라인 픽스처**(코드에 직접 쓴 객체)로 작성한다. 이는 리팩토링이 동작을 바꾸지 않았음을 증명하는 안전망이다. Phase 2에서 실물 픽스처 파일 기반 테스트가 추가되며, spec §9의 완료 기준 4번은 Phase 2 완료 시점에 충족된다.

## File Structure

| 파일 | 책임 |
|---|---|
| `vitest.config.ts` (신규, 루트) | 테스트 탐색 범위 지정 |
| `package.json` (수정, 루트) | `test` 스크립트 + vitest devDependency |
| `.github/workflows/ci.yml` (신규) | push/PR마다 typecheck + test |
| `packages/pipeline/src/kis.ts` (수정) | 파서 분리 + 덤프 훅 |
| `packages/pipeline/src/kis.test.ts` (신규) | 파서 4종 + 덤프 술어 테스트 |
| `packages/pipeline/src/finalize.ts` (수정, Task 7만) | `getKisTokenCached` export |
| `packages/pipeline/src/finalize.test.ts` (신규) | 토큰 캐시 4분기 + enrich 2종 |
| `packages/shared/src/schema.test.ts` (신규) | 스키마 거부/기본값 |
| `packages/pipeline/src/__fixtures__/kis/*.json` (신규, Phase 2) | 실물 KIS 응답 |
| `.github/workflows/finalize.yml` (임시 수정 → Task 9에서 원복) | 일회성 덤프 아티팩트 업로드 |

---

# Phase 1 — 오늘 (20:50 UTC 이전)

## Task 1: vitest 셋업 + 스키마 테스트 + CI 워크플로

첫 테스트를 스키마로 잡는 이유는 외부 의존이 전혀 없어 셋업 검증에 가장 적합하기 때문이다.

**Files:**
- Create: `vitest.config.ts`
- Create: `packages/shared/src/schema.test.ts`
- Create: `.github/workflows/ci.yml`
- Modify: `package.json` (루트)

**Interfaces:**
- Consumes: 없음
- Produces: `npm test` 명령. 이후 모든 Task가 이 명령으로 검증한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/shared/src/schema.test.ts`:

```ts
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
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test`
Expected: FAIL — `npm error Missing script: "test"`

- [ ] **Step 3: vitest 설치 및 설정**

Run: `npm install -D vitest@^2.1.0 -w daily-stock`

`vitest.config.ts` (루트):

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/src/**/*.test.ts"],
    environment: "node",
  },
});
```

`package.json` (루트) — `scripts`에 한 줄 추가:

```json
  "scripts": {
    "dev": "npm run dev --workspace apps/web",
    "build": "npm run build --workspace apps/web",
    "test": "vitest run",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present"
  },
```

> **스펙과의 의도적 차이.** spec §4.4는 `vitest run --passWithNoTests`를 적었으나 여기서는
> `--passWithNoTests`를 뺀다. Step 1에서 이미 실제 테스트가 존재하므로 이 플래그는 불필요하고,
> 붙여두면 훗날 테스트 파일이 통째로 사라져도 CI가 green으로 통과해버린다. spec §6이
> "픽스처 부재를 덮는 용도가 아니다"라고 못 박은 취지에 더 부합하는 쪽은 빼는 것이다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — `Test Files 1 passed (1)`, `Tests 6 passed (6)`

- [ ] **Step 5: CI 워크플로 작성**

`.github/workflows/ci.yml`:

```yaml
name: ci

# Independent of finalize.yml on purpose: a failing unit test must never stop
# the 06:15 KST report from publishing. Gating publication is harness C's job.
on:
  push:
    branches: ["**"]
  pull_request:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci || npm install

      - name: Typecheck
        run: npm run typecheck

      - name: Test
        run: npm test
```

- [ ] **Step 6: typecheck도 통과하는지 확인**

Run: `npm run typecheck`
Expected: 오류 출력 없이 종료 (exit 0)

- [ ] **Step 7: 커밋**

```bash
git add vitest.config.ts package.json package-lock.json \
        packages/shared/src/schema.test.ts .github/workflows/ci.yml
git commit -m "test: add vitest, schema tests, and a CI gate

The repo had no tests and no typecheck on push, so deleting the gpt-4o baseline
earlier today had to be verified by hand. This adds the harness.

Schema is the first target because it has no external dependencies, which makes
it the cleanest proof that the vitest setup itself works.

ci.yml is deliberately independent of finalize.yml — a broken unit test must not
stop the 06:15 KST report. Gating publication belongs to harness C.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: 덤프 훅 + finalize.yml 일회성 캡처 ⏰ 20:50 UTC 마감

**이 Task는 오늘 밤 루틴 실행 전에 origin에 올라가야 한다.**

**Files:**
- Modify: `packages/pipeline/src/kis.ts`
- Modify: `packages/pipeline/src/kis.test.ts` (Task 1에서는 미생성 — 여기서 생성)
- Modify: `.github/workflows/finalize.yml`

**Interfaces:**
- Consumes: `npm test` (Task 1)
- Produces: `shouldDumpResponse(url: string): boolean` — Task 9에서 제거 대상

- [ ] **Step 1: 실패하는 보안 테스트 작성**

`packages/pipeline/src/kis.test.ts` (신규):

```ts
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
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test`
Expected: FAIL — `does not provide an export named 'shouldDumpResponse'`

- [ ] **Step 3: 덤프 훅 구현**

`packages/pipeline/src/kis.ts` — 파일 상단 import에 추가:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
```

`const REAL_DOMAIN = ...` 아래에 추가:

```ts
/**
 * TEMPORARY (2026-07-20): one-shot capture of real KIS responses so the test
 * fixtures are actual API output rather than hand-authored guesses. Active only
 * when KIS_DUMP_DIR is set. Remove once fixtures are committed.
 *
 * SECURITY: token issuance responses carry access_token and must never be
 * written to a CI artifact. Only quote endpoints are dumped, and request
 * headers (appkey/appsecret/authorization) are never recorded.
 */
export function shouldDumpResponse(url: string): boolean {
  return !url.includes("/oauth2/");
}

async function dumpResponse(url: string, name: string, body: unknown): Promise<void> {
  const dir = process.env.KIS_DUMP_DIR;
  if (!dir || !shouldDumpResponse(url)) return;
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(resolve(dir, `${name}.json`), JSON.stringify(body, null, 2));
    console.log(`[kis] dumped ${name}.json`);
  } catch (e) {
    // Capture is a side errand — never let it break the report.
    console.warn(`[kis] dump ${name} skipped: ${(e as Error).message}`);
  }
}
```

- [ ] **Step 4: 네 개의 시세 함수에 덤프 호출 삽입**

`getDomesticQuote` — `const data = (await res.json()) as { output?: Record<string, string> };` 바로 다음 줄에:

```ts
  await dumpResponse(url, `domestic-quote-${code}`, data);
```

`getDomesticDaily` — `const data = (await res.json()) as { output?: Record<string, string>[] };` 다음 줄에:

```ts
  await dumpResponse(url, `domestic-daily-${code}`, data);
```

`getOverseasQuote` — `const data = (await res.json()) as { output?: Record<string, string> };` 다음 줄에:

```ts
      await dumpResponse(url, `overseas-quote-${symbol}-${excd}`, data);
```

`getOverseasIndex` — `};` 로 끝나는 `const data = (await res.json()) as {...}` 선언 다음 줄에:

```ts
  await dumpResponse(url, `overseas-index-${code.replace(/^\./, "dot-")}`, data);
```

> `.VIX` / `.DJI`의 선행 점을 `dot-`으로 바꾸는 이유는 점으로 시작하는 파일명이 숨김 파일이 되어 `actions/upload-artifact`에서 누락될 수 있기 때문이다.

- [ ] **Step 5: 테스트와 typecheck 통과 확인**

Run: `npm test && npm run typecheck`
Expected: PASS — `Tests 9 passed (9)`, typecheck 오류 없음

- [ ] **Step 6: finalize.yml에 일회성 캡처 추가**

`.github/workflows/finalize.yml` — `Finalize + persist to Supabase` step의 `env:` 블록 마지막에 한 줄 추가:

```yaml
          KIS_DUMP_DIR: ${{ github.workspace }}/kis-dump
```

그리고 그 step **다음에** 새 step 추가:

```yaml
      # TEMPORARY (2026-07-20): capture real KIS responses once for test
      # fixtures. Remove with the dump hook after fixtures are committed.
      - name: Upload KIS response fixtures
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: kis-fixtures
          path: kis-dump/
          if-no-files-found: warn
          retention-days: 7
```

- [ ] **Step 7: 커밋 및 즉시 push**

```bash
git add packages/pipeline/src/kis.ts packages/pipeline/src/kis.test.ts \
        .github/workflows/finalize.yml
git commit -m "test: capture real KIS responses once for fixtures

Hand-authored fixtures would only prove the parser matches my belief about what
KIS returns, not what it actually returns — and every bug this project has hit
lived exactly there. So the fixtures come from a real run instead.

The hook is inert unless KIS_DUMP_DIR is set, and finalize.yml sets it for one
night only. Token issuance responses are excluded by shouldDumpResponse because
they carry access_token, which must never reach a CI artifact; request headers
are never recorded either. Dump failures warn and continue — capture must not
be able to break the report.

Both the hook and the workflow step are removed once fixtures land.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push origin claude/stock-market-report-app-9to46d
```

- [ ] **Step 8: push가 finalize를 발화시키지 않았는지 확인**

Run: `sleep 20 && gh run list --limit 3 --json name,createdAt,conclusion`
Expected: `finalize-report`의 **새 run이 없어야 한다**. `finalize.yml`은 `paths: reports/report.json`으로 필터되므로 워크플로 파일 자체의 변경으로는 발화하지 않는다. `ci` run은 새로 생겨야 정상이다.

---

## Task 3: `parseDomesticQuote` 추출

**Files:**
- Modify: `packages/pipeline/src/kis.ts`
- Modify: `packages/pipeline/src/kis.test.ts`

**Interfaces:**
- Consumes: `KisQuote` (기존 타입)
- Produces: `parseDomesticQuote(output: Record<string,string> | undefined, code: string): KisQuote`

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/pipeline/src/kis.test.ts` — import에 `parseDomesticQuote` 추가 후 아래 블록 append:

```ts
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
```

- [ ] **Step 2: 실패 확인**

Run: `npm test`
Expected: FAIL — `does not provide an export named 'parseDomesticQuote'`

- [ ] **Step 3: 파서 추출**

`packages/pipeline/src/kis.ts` — `getDomesticQuote` 함수 **바로 위**에 추가:

```ts
/**
 * Parse a domestic quote payload. Pure — the fetch lives in getDomesticQuote.
 *
 * prdy_vrss_sign: 1 상한 / 2 상승 / 3 보합 / 4 하한 / 5 하락. prdy_vrss and
 * prdy_ctrt come back as magnitudes, so apply the sign ourselves.
 */
export function parseDomesticQuote(
  output: Record<string, string> | undefined,
  code: string,
): KisQuote {
  if (!output || output.stck_prpr == null) throw new Error(`KIS price ${code}: empty output`);
  const down = output.prdy_vrss_sign === "4" || output.prdy_vrss_sign === "5";
  const sign = down ? -1 : 1;
  return {
    code,
    price: Number(output.stck_prpr),
    changeAbs: Math.abs(Number(output.prdy_vrss)) * sign,
    changePct: Math.abs(Number(output.prdy_ctrt)) * sign,
  };
}
```

그리고 `getDomesticQuote`의 본문 마지막 부분을 교체한다. 기존:

```ts
  const data = (await res.json()) as { output?: Record<string, string> };
  await dumpResponse(url, `domestic-quote-${code}`, data);
  const o = data.output;
  if (!o || o.stck_prpr == null) throw new Error(`KIS price ${code}: empty output`);
  const down = o.prdy_vrss_sign === "4" || o.prdy_vrss_sign === "5";
  const sign = down ? -1 : 1;
  return {
    code,
    price: Number(o.stck_prpr),
    changeAbs: Math.abs(Number(o.prdy_vrss)) * sign,
    changePct: Math.abs(Number(o.prdy_ctrt)) * sign,
  };
```

교체 후:

```ts
  const data = (await res.json()) as { output?: Record<string, string> };
  await dumpResponse(url, `domestic-quote-${code}`, data);
  return parseDomesticQuote(data.output, code);
```

기존 함수 위에 있던 `// prdy_vrss_sign: ...` 주석도 함께 제거한다(파서 docstring으로 옮겼다).

- [ ] **Step 4: 통과 확인**

Run: `npm test && npm run typecheck`
Expected: PASS — `Tests 14 passed (14)`

- [ ] **Step 5: 커밋**

```bash
git add packages/pipeline/src/kis.ts packages/pipeline/src/kis.test.ts
git commit -m "refactor: extract parseDomesticQuote as a pure function

Splitting parsing from transport so fixtures can drive it directly instead of
through a mocked fetch, which otherwise buries the logic under scaffolding.

Behavior is unchanged, deliberately — including that KIS returns magnitudes and
the sign has to be applied from prdy_vrss_sign (4/5 = down). That inversion was
a real bug once; now it has tests.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `parseDomesticDaily` 추출

**Files:**
- Modify: `packages/pipeline/src/kis.ts`
- Modify: `packages/pipeline/src/kis.test.ts`

**Interfaces:**
- Consumes: `KisCandle` (기존 타입)
- Produces: `parseDomesticDaily(rows: Record<string,string>[] | undefined, limit: number): KisCandle[]`

- [ ] **Step 1: 실패하는 테스트 작성**

import에 `parseDomesticDaily` 추가 후 append:

```ts
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
```

- [ ] **Step 2: 실패 확인**

Run: `npm test`
Expected: FAIL — `does not provide an export named 'parseDomesticDaily'`

- [ ] **Step 3: 파서 추출**

`getDomesticDaily` **바로 위**에 추가:

```ts
/** Parse daily candles. KIS returns newest-first; we emit oldest-first. */
export function parseDomesticDaily(
  rows: Record<string, string>[] | undefined,
  limit: number,
): KisCandle[] {
  const candles: KisCandle[] = (rows ?? [])
    .filter((r) => r.stck_bsop_date && r.stck_clpr)
    .map((r) => ({ date: r.stck_bsop_date, close: Number(r.stck_clpr) }));
  candles.reverse();
  return candles.slice(-limit);
}
```

`getDomesticDaily` 본문의 아래 부분을

```ts
  const rows = data.output ?? [];
  const candles: KisCandle[] = rows
    .filter((r) => r.stck_bsop_date && r.stck_clpr)
    .map((r) => ({ date: r.stck_bsop_date, close: Number(r.stck_clpr) }));
  // API returns newest-first; return oldest-first, trimmed to `limit`.
  candles.reverse();
  return candles.slice(-limit);
```

다음으로 교체:

```ts
  return parseDomesticDaily(data.output, limit);
```

- [ ] **Step 4: 통과 확인**

Run: `npm test && npm run typecheck`
Expected: PASS — `Tests 18 passed (18)`

- [ ] **Step 5: 커밋**

```bash
git add packages/pipeline/src/kis.ts packages/pipeline/src/kis.test.ts
git commit -m "refactor: extract parseDomesticDaily as a pure function

Same split as parseDomesticQuote. The ordering flip (KIS sends newest-first, the
chart wants oldest-first) and the limit slice are easy to get backwards silently,
so both now have tests.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `parseOverseasQuote` 추출

**Files:**
- Modify: `packages/pipeline/src/kis.ts`
- Modify: `packages/pipeline/src/kis.test.ts`

**Interfaces:**
- Consumes: `KisOverseasQuote` (기존 타입)
- Produces: `parseOverseasQuote(output, symbol, exchange): KisOverseasQuote | null` — `null`은 "이 거래소엔 없음, 다음을 시도하라"는 뜻이다.

- [ ] **Step 1: 실패하는 테스트 작성**

import에 `parseOverseasQuote` 추가 후 append:

```ts
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
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test`
Expected: FAIL — `does not provide an export named 'parseOverseasQuote'`

- [ ] **Step 3: 파서 추출**

`getOverseasQuote` **바로 위**에 추가:

```ts
/**
 * Parse one overseas quote payload. Returns null when this exchange has no data
 * for the symbol, which tells the caller to try the next one.
 *
 * `rate`/`diff` may arrive signed or as magnitudes; sign: 4/5 = down.
 */
export function parseOverseasQuote(
  output: Record<string, string> | undefined,
  symbol: string,
  exchange: string,
): KisOverseasQuote | null {
  const last = output ? Number(output.last) : NaN;
  if (!output || !Number.isFinite(last) || last === 0) return null;
  const down = output.sign === "4" || output.sign === "5";
  const rate = Number(output.rate);
  const diff = Number(output.diff);
  return {
    symbol,
    exchange,
    price: last,
    changeAbs: down ? -Math.abs(diff) : Math.abs(diff || 0),
    changePct: down ? -Math.abs(rate) : Math.abs(rate || 0),
  };
}
```

`getOverseasQuote`의 루프 본문에서 `const data = ...` 이후를

```ts
      const data = (await res.json()) as { output?: Record<string, string> };
      await dumpResponse(url, `overseas-quote-${symbol}-${excd}`, data);
      const parsed = parseOverseasQuote(data.output, symbol, excd);
      if (!parsed) {
        lastErr = new Error(`KIS overseas ${symbol}@${excd}: empty`);
        continue;
      }
      return parsed;
```

로 교체한다. 기존의 `const o = data.output;` 부터 `return { symbol, exchange: excd, ... };` 까지가 대상이다.

- [ ] **Step 4: 통과 확인**

Run: `npm test && npm run typecheck`
Expected: PASS — `Tests 23 passed (23)`

- [ ] **Step 5: 커밋**

```bash
git add packages/pipeline/src/kis.ts packages/pipeline/src/kis.test.ts
git commit -m "refactor: extract parseOverseasQuote as a pure function

The exchange fallback (NAS -> NYS -> AMS) hinged on an inline empty-response
check buried in the loop. Returning null from the parser states that contract
explicitly and makes it testable.

Quirks are preserved as-is, including Math.abs(diff || 0) on the up branch only.
This is a refactor; correcting that asymmetry is a separate decision.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `parseOverseasIndex` 추출

파서 4종 중 분기가 가장 많다. `.VIX` 실패의 원인이 된 경로다.

**Files:**
- Modify: `packages/pipeline/src/kis.ts`
- Modify: `packages/pipeline/src/kis.test.ts`

**Interfaces:**
- Consumes: `KisIndex` (기존 타입)
- Produces: `parseOverseasIndex(data: { output1?: Record<string,string>; output2?: Record<string,string>[] }, code: string): KisIndex`

- [ ] **Step 1: 실패하는 테스트 작성**

import에 `parseOverseasIndex` 추가 후 append:

```ts
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
```

- [ ] **Step 2: 실패 확인**

Run: `npm test`
Expected: FAIL — `does not provide an export named 'parseOverseasIndex'`

- [ ] **Step 3: 파서 추출**

`getOverseasIndex` **바로 위**에 추가:

```ts
/**
 * Parse a US index payload. Prefers output1's current fields; falls back to
 * deriving last/prev from the daily series in output2 (newest-first). Throws
 * with the observed keys so a wrong code or renamed field is diagnosable —
 * that error is how the .VIX gap was identified.
 */
export function parseOverseasIndex(
  data: { output1?: Record<string, string>; output2?: Record<string, string>[] },
  code: string,
): KisIndex {
  const n = (v: unknown) => Number(v);
  const o1 = data.output1;
  const cur = o1 ? n(o1.ovrs_nmix_prpr) : NaN;
  if (o1 && Number.isFinite(cur) && cur !== 0) {
    const down = o1.prdy_vrss_sign === "4" || o1.prdy_vrss_sign === "5";
    const abs = Math.abs(n(o1.ovrs_nmix_prdy_vrss)) * (down ? -1 : 1);
    const pct = Math.abs(n(o1.prdy_ctrt)) * (down ? -1 : 1);
    if (Number.isFinite(abs) && Number.isFinite(pct)) {
      return { code, value: cur, changeAbs: round2(abs), changePct: round2(pct) };
    }
  }

  const closes = (data.output2 ?? [])
    .map((r) => n(r.ovrs_nmix_prpr))
    .filter((x) => Number.isFinite(x) && x !== 0);
  if (closes.length >= 2) {
    const [last, prev] = [closes[0], closes[1]];
    const abs = last - prev;
    return { code, value: last, changeAbs: round2(abs), changePct: round2(prev ? (abs / prev) * 100 : 0) };
  }

  throw new Error(
    `KIS index ${code}: unparseable (o1 keys=${Object.keys(o1 ?? {}).slice(0, 10).join(",")}; o2 keys=${Object.keys(data.output2?.[0] ?? {}).slice(0, 10).join(",")})`,
  );
}
```

`getOverseasIndex` 본문에서 `const n = (v: unknown) => Number(v);` 부터 마지막 `throw new Error(...)` 까지를 전부 지우고 다음으로 교체:

```ts
  await dumpResponse(url, `overseas-index-${code.replace(/^\./, "dot-")}`, data);
  return parseOverseasIndex(data, code);
```

(Task 2에서 삽입한 `dumpResponse` 호출이 이미 그 자리에 있다면 중복 추가하지 않는다.)

- [ ] **Step 4: 통과 확인**

Run: `npm test && npm run typecheck`
Expected: PASS — `Tests 28 passed (28)`

- [ ] **Step 5: 커밋**

```bash
git add packages/pipeline/src/kis.ts packages/pipeline/src/kis.test.ts
git commit -m "refactor: extract parseOverseasIndex as a pure function

The branchiest of the four parsers and the one behind the .VIX failure: output1
preferred, output2 derivation as fallback, diagnostic throw listing observed keys
when neither works. All three paths now have tests, including the empty-output2
shape .VIX actually returns.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `getKisTokenCached` 네 분기 테스트

**Files:**
- Modify: `packages/pipeline/src/finalize.ts` (export 한 줄만)
- Create: `packages/pipeline/src/finalize.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `getKisTokenCached`가 export되어 테스트에서 import 가능

> `finalize.ts`는 최상위에서 `main()`을 호출한다. 테스트가 import하면 파이프라인이 실행되어 버린다. **Step 3에서 이를 가드로 막는다.**

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/pipeline/src/finalize.test.ts` (신규):

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getKisTokenCached } from "./finalize";
import * as kis from "./kis";

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
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.issueAccessToken.mockResolvedValue({ token: "FRESH", expiresIn: 86400 });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
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

  it("캐시 읽기가 실패하면 재발급한다", async () => {
    const sb = fakeSupabase({ readError: { message: "relation does not exist" } });
    expect(await getKisTokenCached(CREDS, sb as never)).toBe("FRESH");
  });

  it("캐시 쓰기가 실패해도 토큰은 반환한다", async () => {
    const sb = fakeSupabase({ writeError: { message: "permission denied" } });
    expect(await getKisTokenCached(CREDS, sb as never)).toBe("FRESH");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test`
Expected: FAIL — `does not provide an export named 'getKisTokenCached'`

- [ ] **Step 3: `finalize.ts`를 import 가능하게 만들기**

`async function getKisTokenCached(` 를 다음으로 바꾼다:

```ts
export async function getKisTokenCached(
```

그리고 파일 **맨 끝**의

```ts
main().catch((e) => {
  console.error("[finalize] failed:", e);
  process.exit(1);
});
```

를 다음으로 교체한다:

```ts
// Only run the pipeline when executed as a script. Tests import this module for
// its helpers and must not kick off a real Supabase/KIS run.
if (process.env.VITEST === undefined) {
  main().catch((e) => {
    console.error("[finalize] failed:", e);
    process.exit(1);
  });
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test && npm run typecheck`
Expected: PASS — `Tests 32 passed (32)`

- [ ] **Step 5: finalize가 여전히 스크립트로 동작하는지 확인**

Run: `npm run -s finalize -w @daily-stock/pipeline`
Expected: FAIL, 단 **`[finalize] failed:` 로 시작하는 에러**여야 한다 (Supabase 자격증명이 로컬에 없으므로). 아무 출력 없이 종료하면 가드가 잘못된 것이다.

- [ ] **Step 6: 커밋**

```bash
git add packages/pipeline/src/finalize.ts packages/pipeline/src/finalize.test.ts
git commit -m "test: cover the four branches of getKisTokenCached

This cache is what keeps KIS token issuance within its once-per-day limit, and
it previously reported failures as successes because supabase-js returns errors
instead of throwing. Each branch — reuse, near-expiry reissue, read error, write
error — is now pinned with a fake client, no network involved.

finalize.ts ran main() at import time, which would have launched a real pipeline
the moment a test imported it, so that call is now guarded to script execution.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: `enrichMoversWithKis` / `enrichIndicesWithKis` 테스트

**Files:**
- Modify: `packages/pipeline/src/finalize.ts` (export 2건)
- Modify: `packages/pipeline/src/finalize.test.ts`

**Interfaces:**
- Consumes: Task 7의 `VITEST` 가드
- Produces: `enrichMoversWithKis`, `enrichIndicesWithKis` export

- [ ] **Step 1: 실패하는 테스트 작성**

`finalize.test.ts` import 줄을 다음으로 교체:

```ts
import { getKisTokenCached, enrichMoversWithKis, enrichIndicesWithKis } from "./finalize";
```

그리고 파일 끝에 append:

```ts
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
```

- [ ] **Step 2: 실패 확인**

Run: `npm test`
Expected: FAIL — `does not provide an export named 'enrichMoversWithKis'`

- [ ] **Step 3: 두 함수 export**

`packages/pipeline/src/finalize.ts`에서 다음 두 줄 앞에 `export`를 붙인다:

```ts
export async function enrichMoversWithKis(
```

```ts
export async function enrichIndicesWithKis(
```

- [ ] **Step 4: 통과 확인**

Run: `npm test && npm run typecheck`
Expected: PASS — `Tests 37 passed (37)`

- [ ] **Step 5: 커밋 및 push**

```bash
git add packages/pipeline/src/finalize.ts packages/pipeline/src/finalize.test.ts
git commit -m "test: cover KIS enrichment of movers and indices

Two properties worth pinning. The US-ticker regex must leave Korean codes like
000660.KS alone, and an unmapped symbol (KOSPI, VIX) must keep its researched
value rather than being zeroed — that is exactly how VIX survives KIS not
offering it.

Also pins that one failing ticker or index never aborts the rest, which is what
keeps a partial KIS outage from emptying the report.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push origin claude/stock-market-report-app-9to46d
```

- [ ] **Step 6: CI가 green인지 확인**

Run: `sleep 60 && gh run list --workflow=ci.yml --limit 1 --json conclusion,createdAt`
Expected: `"conclusion":"success"`

---

# Phase 2 — 내일 아침 (루틴 실행 후)

## Task 9: 실물 픽스처 커밋 + 픽스처 기반 테스트 + 덤프 훅 제거

**선행 조건:** 오늘 밤 20:50 UTC 루틴이 실행되어 `finalize-report` run이 `kis-fixtures` 아티팩트를 남겼을 것.

**Files:**
- Create: `packages/pipeline/src/__fixtures__/kis/*.json`
- Modify: `packages/pipeline/src/kis.test.ts`
- Modify: `packages/pipeline/src/kis.ts` (덤프 훅 제거)
- Modify: `.github/workflows/finalize.yml` (일회성 step 제거 — 최종 diff 없음)

**Interfaces:**
- Consumes: Task 3–6의 `parse*` 함수
- Produces: 없음 (최종 Task)

- [ ] **Step 1: 아티팩트 내려받기**

```bash
RUN=$(gh run list --workflow=finalize.yml --limit 1 --json databaseId --jq '.[0].databaseId')
mkdir -p /tmp/kis-fixtures
gh run download "$RUN" -n kis-fixtures -D /tmp/kis-fixtures
ls -la /tmp/kis-fixtures
```

Expected: `domestic-quote-000660.json`, `domestic-daily-000660.json`, `overseas-quote-*.json`, `overseas-index-SPX.json`, `overseas-index-dot-VIX.json` 등이 보인다.

**아티팩트가 없으면 여기서 멈추고 사용자에게 보고한다.** 손으로 지어낸 픽스처로 대체하지 않는다 (spec §9 완료 기준 4번).

- [ ] **Step 2: 토큰 유출이 없는지 검사 — 반드시 수행**

```bash
grep -ril "access_token\|appsecret\|Bearer" /tmp/kis-fixtures/ || echo "CLEAN"
```

Expected: `CLEAN`

**출력이 `CLEAN`이 아니면 해당 파일을 커밋하지 말고 즉시 사용자에게 보고한다.**

- [ ] **Step 3: 픽스처 배치**

```bash
mkdir -p packages/pipeline/src/__fixtures__/kis
cp /tmp/kis-fixtures/*.json packages/pipeline/src/__fixtures__/kis/
ls packages/pipeline/src/__fixtures__/kis/
```

- [ ] **Step 4: 픽스처 기반 테스트 작성**

`packages/pipeline/src/kis.test.ts` 맨 끝에 append. 파일명은 **Step 3에서 실제로 확인한 이름**으로 맞춘다.

```ts
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
    expect(q.price).toBeGreaterThan(0);
    expect(Number.isFinite(q.changePct)).toBe(true);
  });

  it("국내 일별봉을 oldest-first로 파싱한다", () => {
    const c = parseDomesticDaily(fixture("domestic-daily-000660.json").output, 10);
    expect(c.length).toBeGreaterThanOrEqual(2);
    expect(c.every((x) => x.close > 0)).toBe(true);
    expect(Number(c[0].date)).toBeLessThan(Number(c[c.length - 1].date));
  });

  it("해외 현재가를 파싱한다", () => {
    // 파일명 접미사는 어느 거래소에서 응답이 왔는지에 따라 달라진다(NAS/NYS/AMS).
    const name = readdirSync(FIXTURES).find((f) => f.startsWith("overseas-quote-"));
    if (!name) throw new Error(`overseas-quote fixture missing in ${FIXTURES}`);
    const excd = name.replace(/\.json$/, "").split("-").pop()!;
    const q = parseOverseasQuote(fixture(name).output, "MU", excd);
    expect(q).not.toBeNull();
    expect(q!.price).toBeGreaterThan(0);
    expect(Number.isFinite(q!.changePct)).toBe(true);
  });

  it("해외지수 SPX를 output1 경로로 파싱한다", () => {
    const i = parseOverseasIndex(fixture("overseas-index-SPX.json"), "SPX");
    expect(i.value).toBeGreaterThan(0);
  });

  it(".VIX는 여전히 파싱 불가이며 진단 정보를 담아 throw한다", () => {
    expect(() => parseOverseasIndex(fixture("overseas-index-dot-VIX.json"), ".VIX")).toThrow(/\.VIX/);
  });
});
```

- [ ] **Step 5: 통과 확인**

Run: `npm test`
Expected: PASS. 픽스처 파일명이 다르면 `fixture missing:` 에러가 나므로 Step 4의 이름을 실제에 맞게 고친다.

- [ ] **Step 6: 덤프 훅 제거**

`packages/pipeline/src/kis.ts`에서 다음을 모두 삭제한다.

1. `shouldDumpResponse` 함수와 그 위 주석 블록
2. `dumpResponse` 함수
3. 네 곳의 `await dumpResponse(...)` 호출
4. 이제 쓰이지 않는 import: `import { mkdir, writeFile } from "node:fs/promises";` 와 `import { resolve } from "node:path";`

`packages/pipeline/src/kis.test.ts`에서 `describe("shouldDumpResponse", ...)` 블록 전체와 import의 `shouldDumpResponse`를 삭제한다.

- [ ] **Step 7: `finalize.yml` 원복**

`.github/workflows/finalize.yml`에서 다음을 삭제한다.

1. `env:` 블록의 `KIS_DUMP_DIR: ${{ github.workspace }}/kis-dump` 한 줄
2. `Upload KIS response fixtures` step 전체와 그 위 주석 2줄

Run: `git diff origin/claude/stock-market-report-app-9to46d~8 -- .github/workflows/finalize.yml`
Expected: **출력 없음.** `finalize.yml`이 Task 2 이전 상태와 동일해야 한다 (spec §9 완료 기준 6번).

- [ ] **Step 8: 최종 검증**

Run: `npm test && npm run typecheck`
Expected: PASS — 픽스처 테스트 5건 추가, `shouldDumpResponse` 3건 제거 (총 39건)

Run: `grep -rn "dumpResponse\|KIS_DUMP_DIR" packages/ .github/ || echo "REMOVED"`
Expected: `REMOVED`

- [ ] **Step 9: 커밋 및 push**

```bash
git add packages/pipeline/src/__fixtures__ packages/pipeline/src/kis.ts \
        packages/pipeline/src/kis.test.ts .github/workflows/finalize.yml
git commit -m "test: pin parsers against real captured KIS responses

Fixtures are the actual payloads from last night's routine run, not invented
ones — which is the whole point, since a hand-written fixture only proves the
parser matches my assumptions about KIS rather than KIS itself. Verified free of
access_token and credentials before committing.

The .VIX fixture pins current reality: KIS returns an empty series for it, so
the report keeps the researched value. If KIS ever starts serving VIX, that test
fails and tells us to revisit.

Capture hook and the temporary finalize.yml step are removed; finalize.yml is
back to its pre-capture state.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push origin claude/stock-market-report-app-9to46d
```

- [ ] **Step 10: CI green 확인 및 완료 기준 대조**

Run: `sleep 60 && gh run list --workflow=ci.yml --limit 1 --json conclusion`
Expected: `"conclusion":"success"`

spec §9의 6개 완료 기준을 하나씩 대조하고, 충족되지 않은 항목이 있으면 보고한다.

---

## 완료 후 상태

- `npm test` — 39개 (Phase 1의 37개 − `shouldDumpResponse` 3개 + 픽스처 5개)
- `ci.yml` — push마다 typecheck + test, `finalize.yml`과 독립
- `finalize.yml` — 이 계획 시작 시점과 동일
- 다음 하네스: **B(발행 감시·자가진단)**. 별도 spec으로 다룬다.

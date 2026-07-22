# 발행 감시·자가진단 설계 (하네스 B)

작성일 2026-07-22 · 상태: 승인됨 · 대상 브랜치 `claude/stock-market-report-app-9to46d`

---

## 0) 배경

매일 05:50 KST에 Claude Routine이 리포트를 작성해 push하고, `finalize.yml`이 KIS
앵커링·이미지·Supabase 적재를 처리한다(`docs/HANDOFF.md` §5). 하네스 A(테스트+CI)는 완성됐다.

그러나 **발행이 조용히 실패해도 아무도 모른다.** 실제로 관측된 실패:

- **조용한 KIS 실패** — 2026-07-20 수동 테스트에서 finalize가 `success`로 끝났는데 KIS는
  `0/3 movers, 0 indices` 앵커링이었다(GitHub 러너→KIS 간헐 차단). 워크플로는 초록불,
  리포트엔 시세가 통째로 빠진 채 Supabase 적재까지 정상 완료됐다.
- **루틴 미발화** — 클라우드 세션이 안 뜨거나 push가 실패하면 06:15에 리포트 자체가 없다.
- **개장 전 focus 0%** — 정규 스케줄이 KRX 개장 전에 돌아 하이닉스 등락이 매일 0%로 박혔다.
  **이건 2026-07-22에 코드로 근본 수정했다**(`focusPriceFromKis`, 커밋 a688495).

하네스 B는 발행 직후 이런 이상을 **감지해 마스터께 알린다.**

## 1) 하네스 로드맵에서의 위치

```
A. 코드 테스트 + CI 게이트   ← 완성
B. 발행 감시·자가진단        ← 이 문서
C. 리포트 품질 검증
D. 자가치유
```

**경계.** B는 **감지·알림까지**다. 고치는 것은 D, 본문 내용의 진실성(출처 생존·서술 정확)은 C.
B는 **구조·운영 층**만 본다 — 발행됐나, 시세가 채워졌나, 시각 안에 나왔나.

## 2) 설계 원칙

1. **감시는 감시 대상과 분리한다.** finalize와 다른 워크플로, 다른 시각. finalize가 통째로
   안 돌아도 B는 돌아서 "리포트 없음"을 잡아야 한다.
2. **감시는 추측하지 않고 사실을 읽는다.** finalize가 앵커링 결과를 기록하고, B는 그 숫자를
   조회만 한다. 리포트 내용에서 "앵커링이 됐나"를 추론하면 러너 차단(앵커링 0)과 정상을
   구분하지 못한다.
3. **오탐 제로가 기준이다.** 헛경보가 한 번 오면 마스터는 알림을 무시하게 되고, 무시당하는
   감시는 없느니만 못하다. 그래서 유일한 오탐원이던 수치-상식 검사를 뺐다(§7).

## 3) 결정 사항

| 항목 | 결정 | 근거 |
|---|---|---|
| 실행 위치 | **GitHub Actions cron** | Supabase 시크릿·안정적 예약·오픈 네트워크. 로컬 맥엔 자격증명 없음 |
| 실행 시각 | **~21:25 UTC** (발행·데드라인 후) | finalize 완료 실측 21:01:35 UTC, 데드라인 06:15 KST=21:15 UTC |
| 알림 채널 | **워크플로 실패 메일** | 추가 시크릿·구현 0. 정상일 땐 완전히 조용 |
| 신호 원천 | **finalize가 앵커링 수를 pipeline_meta에 기록** | 감시가 추측하지 않게 |
| 날짜 | **`usEasternDate` 재사용** | finalize가 미국 동부 날짜로 행을 매김. KST로 계산하면 매일 오탐 |
| 감시자 공백 | **베스트-에포트 v1, 한계 명시** | B가 안 돌면 침묵(정상처럼 보임). 하트비트는 v2 |

## 4) 컴포넌트

### 4.1 finalize.ts — 앵커링 수 기록

현재 `enrichFocusWithKis`·`enrichMoversWithKis`·`enrichIndicesWithKis`는 `ok`를 세면서도
`void`를 반환한다. **세 함수가 앵커링 수를 반환하도록 바꾼다.**

```ts
// 반환 타입만 바뀐다. 계산·로그·시그니처 인자는 그대로.
export async function enrichFocusWithKis(...): Promise<number>    // 0 또는 1
export async function enrichMoversWithKis(...): Promise<number>   // 앵커링된 US 티커 수
export async function enrichIndicesWithKis(...): Promise<number>  // 앵커링된 지수 수
```

`main()`이 반환값을 받아 `pipeline_meta`에 싣는다.

```ts
let focusAnchored = 0, moversAnchored = 0, indicesAnchored = 0;
if (token) {
  focusAnchored   = await enrichFocusWithKis(extracted, kisCreds, token);
  moversAnchored  = await enrichMoversWithKis(extracted, kisCreds, token);
  indicesAnchored = await enrichIndicesWithKis(extracted, kisCreds, token);
}
// ... pipeline_meta 에 추가:
//   focus_anchored: focusAnchored,
//   movers_anchored: moversAnchored,
//   indices_anchored: indicesAnchored,
//   kis_creds_present: kisCreds != null,
```

`kis_creds_present`를 함께 기록하는 이유: 시크릿이 아예 없어 앵커링을 시도조차 안 한 경우와
러너 차단으로 실패한 경우를 B가 구분하기 위해서다(§4.3 ②).

**동작 보존.** 반환 타입 외에는 한 줄도 바꾸지 않는다. 기존 테스트(Task 8)는 반환값을 무시하므로
깨지지 않는다. 새 반환값에 대한 테스트를 추가한다.

### 4.2 check.ts — 순수 판정 + 실행

하네스 A의 파서 패턴 그대로: 판정을 **순수 함수**로 빼고 워크플로는 조회+실행만 한다.

```ts
export interface DailyRow {
  report_date: string;
  status: string;
  content: any;               // ReportContent
  pipeline_meta: any | null;
}

export interface CheckIssue {
  check: string;              // "existence" | "anchoring" | "structure"
  message: string;            // 사람이 읽는 한 줄
}

/** 순수 판정. row 가 null 이면 "오늘자 리포트 없음". */
export function runChecks(row: DailyRow | null, expectedDate: string): CheckIssue[]
```

`main()`은 Supabase를 조회해 `runChecks`를 돌리고, 이슈가 있으면 이슈들을 출력한 뒤
`process.exit(1)`로 실패 메일을 발생시킨다.

### 4.3 검사 (전부 하드-실패 → 메일)

| # | 검사 | 실패 조건 | 휴장 견고성 |
|---|---|---|---|
| ① 존재·신선도 | `row == null` 또는 `row.status != "ready"` | ✅ 휴장일에도 리포트는 발행된다. B가 데드라인 후 도므로 "없음"은 곧 "제때 안 왔음" |
| ② KIS 앵커링 | `kis_creds_present == true` 인데 `movers_anchored == 0` 또는 `indices_anchored == 0` | ✅ 닫힌 시장도 전일 종가로 N개를 앵커링한다(실측). 0은 오직 러너 차단 |
| ③ 구조 완전성 | `content.headlines` 비었거나 `content.sections` 비었거나 `content.focus.price.value`가 숫자 아니거나 `market_summary.indices`가 비었음 | ✅ |

②의 `kis_creds_present` 가드: 시크릿 미설정 시 앵커링 0이 정상이므로, 자격증명이 있었을 때만
0을 실패로 본다.

②는 `pipeline_meta`에 **앵커링 필드 자체가 없으면 판정을 건너뛴다**. 이는 이 finalize 수정이
배포되기 전 하루치 발행에만 해당하는 과도기 처리다 — 수정과 B가 함께 배포되면 그날부터 모든 행에
필드가 있으므로 skip은 발생하지 않는다. skip은 로그에 `[check] SKIP: anchoring (no meta)`로
남겨, 조용히 넘어간 게 아니라 의도된 것임을 드러낸다.

### 4.4 check.yml

```yaml
name: check-report
on:
  schedule:
    - cron: "25 21 * * *"   # 06:25 KST — 발행·데드라인(21:15) 후
  workflow_dispatch: {}

# finalize.yml 과 독립. B 실패가 발행을 막지 않는다(발행은 이미 끝났다).
```

단계: checkout → setup-node 22 → `npm ci` → `npm run check`. env로 `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` 주입. pipeline package.json에 `"check": "tsx src/check.ts"` 추가.

### 4.5 날짜 처리

B는 `usEasternDate(new Date())`로 기대 날짜를 구한다 — finalize가 행을 매긴 것과 **똑같은 함수**다.
B는 finalize보다 ~24분 뒤 도는데 둘 다 미국 동부 같은 날(~17:00 ET)이라 날짜가 일치한다.
KST 기준 날짜를 쓰면 매일 하루 어긋나 오탐하므로 **절대 지역 날짜를 쓰지 않는다.**

### 4.6 인프라 오류 vs 감지된 이상 (신호 구분)

`exit(1)`은 "나쁜 브리핑 발견"이든 "B가 Supabase에 못 닿음"이든 같은 메일을 보낸다. 이를 구분한다.

- `main()`이 Supabase 조회 자체의 예외(네트워크·인증)를 **잡아서** `"[check] INFRA: 조회 실패 …"`로
  로깅하고 exit(1).
- `runChecks`가 이슈를 반환하면 `"[check] FAIL: <검사> — <메시지>"`로 로깅하고 exit(1).
- 정상이면 `"[check] OK: <date> 리포트 정상 (앵커링 …)"` 로깅하고 exit(0).

메일 본문(=job 로그)에서 `INFRA`인지 `FAIL`인지 한눈에 보이게 한다.

## 5) 파일 배치

```
packages/pipeline/src/finalize.ts        수정 (enrich 3종 반환 + pipeline_meta)
packages/pipeline/src/check.ts           신규 (runChecks + main)
packages/pipeline/src/check.test.ts      신규
packages/pipeline/package.json           "check" 스크립트 추가
.github/workflows/check.yml              신규
```

## 6) 오류 처리

- `runChecks`는 절대 throw하지 않는다 — 판정만 반환. 조회 오류는 `main()`이 담당한다.
- `pipeline_meta`·`content`의 필드 접근은 옵셔널 체이닝으로 방어한다. 낡은/불완전한 행이
  런타임 예외 대신 명시적 이슈나 skip으로 이어지게 한다.

## 7) 범위 밖 (명시적 제외)

- **수치-상식 검사(focus 0%, 지수 값 이상)** — 삭제. focus 0%는 코드로 근본 수정(a688495)했고,
  정상적으로 등락이 0인 날에 헛경보를 내는 유일한 오탐원이었다.
- **러너→KIS 차단의 예방(재시도)** — finalize 강화 또는 D. B는 감지, D는 복구.
- **감시자 하트비트** — v2. §8 참조.
- **리포트 늦음(데드라인 초과했으나 존재) 정밀 판정** — v1은 "B 실행 시점에 없으면 실패"로
  단순화. created_at 비교는 v2.
- **본문 품질**(출처 생존, 서술 정확) — 하네스 C.

## 8) 알려진 한계 (감시자 공백)

**B가 안 돌면 알림이 없다** — GitHub 예약 워크플로는 지연·누락될 수 있고, B 자체가 크래시할 수도
있다. 실패-메일 방식은 "B가 안 돎"과 "정상"을 구분하지 못한다(둘 다 침묵). v1은 이를 감수한다.
B는 **최선의 2차 방어선**이지 보장된 감시가 아니다. 하트비트(정상일 때도 신호를 남겨 침묵=이상으로
뒤집기)는 v2에서 검토한다 — 단 마스터가 거부한 "매일 오는 메일"을 어떤 형태로든 다시 들이는
문제라 별도 설계가 필요하다.

## 9) 완료 기준

1. `finalize.ts`의 enrich 3종이 앵커링 수를 반환하고, `pipeline_meta`에 세 수 + `kis_creds_present`가 기록된다. 기존 테스트가 여전히 통과한다.
2. `runChecks`가 세 검사를 구현하고, 각 검사가 **실제 실패를 잡는지 뮤테이션으로 검증**된다.
3. 정상 행에는 이슈 0, 관측된 세 실패(리포트 없음 / 앵커링 0 / 빈 구조) 각각에 정확한 이슈를 낸다.
4. `check.yml`이 push에서 CI green이고, `workflow_dispatch`로 수동 실행 시 현재 리포트에 대해 OK로 종료한다.
5. `main()`이 INFRA 오류와 FAIL을 구분해 로깅한다.
6. §8의 감시자 공백이 문서에 명시돼 있다.

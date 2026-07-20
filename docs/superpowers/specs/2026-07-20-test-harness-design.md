# 테스트 하네스 + CI 게이트 설계 (하네스 A)

작성일 2026-07-20 · 상태: 승인됨 · 대상 브랜치 `claude/stock-market-report-app-9to46d`

---

## 0) 배경

daily-stock은 매일 05:50 KST에 Claude Routine이 리포트를 작성해 push하고,
`finalize.yml`이 KIS 시세 앵커링·이미지·Supabase 적재를 처리하는 구조다
(`docs/HANDOFF.md` §5). 2026-07-20 기준 이 파이프라인은 end-to-end로 검증됐다.

그러나 **저장소에 테스트가 하나도 없고, push 시 typecheck조차 돌지 않는다.**
같은 날 gpt-4o 베이스라인(`generate.ts`·`github-models.ts`)을 삭제할 때
빌드가 깨지지 않았는지 사람이 수동으로 확인해야 했다. 안전망이 없다.

이 문서는 사용자가 요청한 "하네스" 네 개 중 **A(코드 테스트 + CI 게이트)**의 설계다.

## 1) 하네스 전체 로드맵에서의 위치

```
A. 코드 테스트 + CI 게이트   ← 이 문서
B. 발행 감시·자가진단
C. 리포트 품질 검증
D. 자가치유 (B에 강하게 의존)
```

진행 순서는 **A → B → C → D**로 합의됐다. A는 나머지 셋을 만들 때의 안전망이 된다.
B·C·D는 각각 별도 spec으로 다룬다. **이 문서의 범위는 A뿐이다.**

## 2) 설계 원칙 — 버그 이력이 곧 테스트 우선순위

이 프로젝트에서 실제로 발생한 버그를 전수 조사한 결과, **전부 외부 응답을 해석하는
지점**에서 났다. 순수 계산 버그는 하나도 없었다.

| 실제 버그 | 위치 |
|---|---|
| `prdy_vrss_sign` 4/5 부호 처리 — KIS가 등락을 절댓값으로 반환 | `kis.ts` 파싱 |
| `.DJI`/`.VIX` 점 접두사 지수 코드 | `finalize.ts` 매핑 |
| `getOverseasIndex`의 `output1` 실패 시 `output2` 폴백 | `kis.ts` 파싱 |
| Supabase `error` 미검사로 실패가 성공처럼 로깅됨 | `finalize.ts` 토큰 캐시 |
| 빈 문자열 fallback (`\|\|` vs `??`) | 설정 파싱 |

따라서 이 하네스는 **응답 파싱 경계에 집중**한다. 커버리지 수치를 목표로 삼지 않는다.

## 3) 결정 사항

| 항목 | 결정 | 근거 |
|---|---|---|
| 프레임워크 | **vitest** | `apps/web`이 이미 Vite 사용. TS 네이티브, 워크스페이스 지원 |
| 테스트 범위 | **응답 픽스처 기반** | 네트워크 미사용. 위 버그 5건을 전부 잡는 최소 범위 |
| 픽스처 출처 | **실물 캡처** (2026-07-20 야간 루틴 실행 중) | 손으로 지어낸 픽스처는 "KIS의 실제 응답"이 아니라 "작성자의 믿음"을 테스트한다 |
| CI와 발행의 관계 | **독립. 테스트 실패가 발행을 막지 않는다** | 매일 06:15 리포트가 제품의 본질. 무관한 테스트 파손으로 발행이 멈추는 손실이 더 크다. 발행 차단 판정은 C의 역할 |

## 4) 컴포넌트

### 4.1 `kis.ts` 파서 분리 (선결 과제)

현재 `kis.ts`의 함수들은 네트워크 호출과 파싱이 한 몸이라, 픽스처 테스트에
`fetch` 전역 모킹이 필요하고 정작 검증 대상인 파싱 로직이 모킹 껍데기에 가린다.

**순수 파서를 추출한다.**

```ts
// 순수 함수 — 테스트 대상
export function parseDomesticQuote(output: Record<string,string>, code: string): KisQuote
export function parseDomesticDaily(rows: Record<string,string>[], limit: number): KisCandle[]
export function parseOverseasQuote(output: Record<string,string>, symbol, excd): KisOverseasQuote | null
export function parseOverseasIndex(data: {output1?, output2?}, code: string): KisIndex

// 기존 async 함수 — fetch 후 위 파서 호출. 외부 시그니처 불변
export async function getDomesticQuote(creds, token, code): Promise<KisQuote>
```

`parseOverseasQuote`가 `null`을 반환하면 호출부가 다음 거래소(NAS→NYS→AMS)로 넘어간다.
현재의 "빈 응답이면 continue" 로직을 파서 반환값으로 표현한 것이다.

**`finalize.ts`는 수정하지 않는다** — 기존 async 함수의 시그니처가 그대로이기 때문이다.

### 4.2 픽스처 수집 (일회성)

`KIS_DUMP_DIR` 환경변수가 설정된 경우에만 응답 본문을 파일로 남기는 훅을 `kis.ts`에
추가하고, `finalize.yml`에 일회성 step으로 `actions/upload-artifact`를 붙인다.

> **보안 — 반드시 지킬 것**
> 토큰 발급 응답(`/oauth2/tokenP`)은 **덤프 대상에서 제외한다.** 본문에 `access_token`이
> 들어 있어 아티팩트로 유출되면 안 된다. 시세 엔드포인트 본문만 기록하며,
> 요청 헤더(`appkey`·`appsecret`·`authorization`)는 일절 기록하지 않는다.

수집 대상 5종:

| 파일 | 내용 |
|---|---|
| `domestic-quote-000660.json` | 국내 현재가 — 부호 처리 검증용 |
| `domestic-daily-000660.json` | 국내 일별봉 — newest-first 순서 확인용 |
| `overseas-quote-MU.json` | 해외 현재가 — 거래소 폴백·부호 검증용 |
| `overseas-index-SPX.json` | 해외지수 **성공** (`output1` 경로) |
| `overseas-index-VIX-empty.json` | 해외지수 **실패** (`output2` 빈 케이스). **최우선** — 폴백 경로를 검증할 유일한 실물이다 |

수집 후 `packages/pipeline/src/__fixtures__/kis/`에 커밋하고,
**덤프 훅과 일회성 step은 제거한다.** 프로덕션에 남기지 않는다.

### 4.3 테스트 대상

| 대상 | 검증 내용 |
|---|---|
| `parseDomesticQuote` | `prdy_vrss_sign` 1·2·3 → 양수, 4·5 → 음수. 절댓값에 부호 적용 |
| `parseDomesticDaily` | newest-first → oldest-last 뒤집기, `limit` slice, 결측 행 필터 |
| `parseOverseasQuote` | `last=0`/빈 응답이면 `null`, `sign` 4·5 → 음수 |
| `parseOverseasIndex` | `output1` 정상 경로 / `output1` 비면 `output2` 폴백 / 둘 다 실패 시 관측된 키 목록을 포함한 에러 |
| `getKisTokenCached` | 유효 캐시 재사용 / 만료 임박(5분 이내) 시 재발급 / `read.error` 시 재발급 / `write.error` 시 경고 후 토큰 반환 |
| `enrichMoversWithKis` | `^[A-Z]{1,5}$` 필터가 `000660.KS`를 제외하는지 |
| `enrichIndicesWithKis` | `KIS_INDEX_CODE` 미매핑 심볼 skip, 개별 실패가 전체를 막지 않음 |
| `LlmReportOutputSchema` | 필수 필드 누락 거부, `sources` 빈 배열 거부, 잘못된 URL 거부, default 적용 |

`getKisTokenCached`는 Supabase 클라이언트를 인자로 받으므로 **가짜 클라이언트 객체를
주입**해 네 분기를 모두 태운다. 네트워크·실제 Supabase를 쓰지 않는다.

### 4.4 CI 워크플로

`.github/workflows/ci.yml`

- 트리거: `push` (전 브랜치), `pull_request`
- 단계: checkout → setup-node 22 (npm 캐시) → `npm ci` → `npm run typecheck` → `npm test`
- **`finalize.yml`과 독립.** 서로를 참조하지 않는다.

루트 `package.json`에 `"test": "vitest run --passWithNoTests"` 추가.

## 5) 파일 배치

```
.github/workflows/ci.yml                        신규
vitest.config.ts                                신규 (루트)
package.json                                    "test" 스크립트 추가
packages/pipeline/src/kis.ts                    파서 분리
packages/pipeline/src/kis.test.ts               신규
packages/pipeline/src/finalize.test.ts          신규
packages/pipeline/src/__fixtures__/kis/*.json   신규 (실물 캡처)
packages/shared/src/schema.test.ts              신규
```

## 6) 오류 처리

테스트 코드 자체의 오류 처리는 vitest에 맡긴다. 단 두 가지를 명시한다.

- **픽스처 누락 시 조용히 통과하지 않는다.** 픽스처 파일을 못 읽으면 테스트는 실패해야 한다.
  `--passWithNoTests`는 루트에서 워크스페이스 전체를 돌릴 때의 편의 옵션이며,
  픽스처 부재를 덮는 용도가 아니다.
- **덤프 훅은 실패해도 finalize를 막지 않는다.** 파일 쓰기 오류는 경고만 남기고 진행한다.
  픽스처 수집은 부가 목적이지 발행의 전제가 아니다.

## 7) 범위 밖 (명시적 제외)

- 실제 KIS·Supabase 호출을 포함한 통합 테스트 — KIS 토큰이 하루 1회 한도라 CI에서 돌릴 수 없다
- 프론트엔드(`apps/web`) 컴포넌트 테스트
- 커버리지 임계값 게이트
- 리포트 **내용**의 품질 판정 — 하네스 C의 범위
- 발행 실패 감지·알림 — 하네스 B의 범위

## 8) 남은 위험

- **픽스처 수집이 오늘 밤 루틴 실행에 의존한다.** 루틴이 실패하면 픽스처를 못 얻는다.
  그 경우 다음 날 재시도하거나, `finalize.yml`을 수동 dispatch한다
  (단 KIS 토큰 캐시가 유효한 시간대여야 추가 발급이 없다).
- **`.VIX` 픽스처는 현재 실패 케이스다.** 만약 KIS가 나중에 VIX를 제공하기 시작하면
  이 픽스처는 과거 형태를 박제하게 된다. 그때는 픽스처를 갱신해야 한다.
- 파서 분리는 `kis.ts`를 건드리므로, 리팩토링 자체가 회귀를 낳을 수 있다.
  **파서 분리와 테스트 작성은 같은 커밋에서 이뤄져야** 회귀를 즉시 잡는다.

## 9) 완료 기준

1. `npm test`가 로컬에서 통과한다
2. `ci.yml`이 push에서 실행되어 green이다
3. 위 4.3 표의 모든 항목에 테스트가 존재한다
4. 픽스처가 **실물 캡처**로 교체되어 있다 (손으로 지은 것이 아님)
5. 덤프 훅과 일회성 CI step이 프로덕션 코드에서 제거되어 있다
6. `finalize.yml`이 픽스처 수집 이전 상태로 되돌아가 있다 — 일회성 덤프 step이
   추가됐다가 제거되므로, 최종 diff는 `finalize.yml`에 대해 비어 있어야 한다

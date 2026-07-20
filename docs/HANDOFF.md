# daily-stock 핸드오프 (2026-07-19 세션 총정리)

새 세션/루틴이 이 문서만 읽고 이어서 작업할 수 있도록 정리한 프롬프트다.

---

## 0) 한 줄 요약

매일 아침(06:15 KST 전) **SK하이닉스 중심 미국증시 리포트**를 만들어 인증 사용자에게 보여주는 웹앱.
**Claude가 두뇌(리서치·분석·작성)**, **GitHub Actions `finalize.yml`이 배관(KIS 시세·이미지·Supabase 적재)**.

## 1) 스택 / 저장소

- 모노레포(npm workspaces): `apps/web`(React+Vite+TS+Tailwind), `packages/shared`(zod 스키마), `packages/pipeline`(collect/generate/finalize/kis).
- 프론트: **Vercel**(무료). 백엔드: **Supabase**(Postgres, Google OAuth, Storage, RLS, `profiles.is_approved` 승인 게이트).
- 작업 브랜치(= 기본 브랜치): **`claude/stock-market-report-app-9to46d`**. 여기에 push하면 CI 동작.

## 2) 데이터 흐름 (현재 정상 작동)

```
Claude 세션(WebSearch 리서치·분석)
  → reports/report.json 작성 (스키마 준수)
  → git push (claude/stock-market-report-app-9to46d)
        │ push 감지 (paths: reports/report.json)
        ▼
  GitHub Actions finalize.yml (오픈 네트워크)
     → KIS 시세 앵커링(하이닉스·미국종목·지수) + 이미지 렌더 + Supabase 적재 + 사용자 개인화
        ▼
  프론트(Vercel) ← Supabase 조회(RLS = 승인자만)
```

**네트워크 제약(중요):** Claude 세션은 **Supabase(*.supabase.co 403)·KIS(9443 포트) 직접 접근 불가**. 그래서 finalize.yml(오픈 네트워크)이 대신 처리. GitHub·WebSearch·Anthropic·npm은 허용.

## 3) 핵심 파일

- `packages/shared/src/schema.ts` — 정본 zod 스키마. `LlmReportOutputSchema` = `{ headline_summary, indices?, macro?, movers?, sector_perf?, focus?, headlines, sections, geopolitics? }`. 필수: headline_summary·headlines·sections, 각 fact는 `sources`(min1, url 유효), `focus.price.value`(number).
- `packages/pipeline/src/finalize.ts` — report.json → **KIS 앵커링 + Supabase 적재**. 순서: report 파싱 → KIS 토큰(캐시) → focus/movers/indices 보정 → daily_reports upsert → user_reports fan-out.
- `packages/pipeline/src/kis.ts` — KIS(한국투자증권) 클라이언트: `issueAccessToken`(발급), 국내 현재가(`FHKST01010100`)·일별(`FHKST01010400`), 해외 현재가(`HHDFS00000300`, NAS→NYS→AMS), 해외지수(`FHKST03030100`, SPX/COMP/.DJI).
- `packages/pipeline/src/generate.ts` — **gpt-4o 베이스라인(무료, 수동 전용)**. 무료 데이터(stooq/Google News RSS) + GitHub Models. `repairForSchema()`로 불완전 출력 보정.
- `packages/pipeline/src/github-models.ts` — GitHub Models 호출(무료, GITHUB_TOKEN).
- `apps/web/src/styles/report.css`, `components/ReportView.tsx`, `FocusSection.tsx`, `GeopoliticsSection.tsx` — variant B 라이트 브로드시트 디자인(하이닉스 심층분석·지정학).
- `docs/DISPATCH.md` — 리포트 스키마 상세.

## 4) KIS 연동 (검증 완료)

- **하이닉스 focus.price + 일별 10봉**, **미국 종목(movers) 3/3**(MU·AMD·NVDA), **미국 지수 3개**(S&P·나스닥·다우). **VIX는 KIS 해외지수 미제공 → 리서치값 유지.**
- 서술 규칙: 하이닉스·미국종목·지수 수치는 finalize가 KIS로 덮어쓰므로, report.json 작성 시 **headline_summary·price_context·thesis에 특정 종가 단정을 피하고 추세 위주로** 쓴다(어긋남 방지).
- **KIS 토큰: 하루 1회 발급·24h 재사용** — Supabase `app_kv` 테이블에 캐시(검증됨: issued&cached → reused).

### GitHub Secrets (Actions)
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `KIS_APP_KEY`, `KIS_APP_SECRET`.
### Supabase 테이블
`daily_reports`, `user_reports`, `profiles`, `preferences`, `app_kv`(토큰 캐시).

## 5) 자동화 — 결론 (2026-07-20 갱신: 해결됨 ✅)

**루틴은 CLI에서 생성했고, Run now로 end-to-end 검증까지 끝났다.** UI 작업 불필요.

- ❌ **`send_later` / MCP `create_trigger`** = 레포 없는 세션으로 실패. **원인 규명됨**: 이 경로들은
  `job_config.ccr.session_context.sources` 를 **넣지 않는다**. 트리거 10개를 전수 조회해 확인.
  MCP의 근본 한계가 아니라 단순 필드 누락이었다.
- ✅ **정답 = `RemoteTrigger` 툴로 직접 create** (`/schedule` 스킬이 이 툴을 로드해준다).
  `session_context.sources: [{git_repository:{url}}]` 를 넣으면 예약 세션이 레포를 갖고 뜬다.
  ~~claude.ai/code/routines UI에서만 가능~~ ← **이전 결론은 틀렸다.**
- **gpt-4o `daily-report.yml`** = cron 제거, **수동 break-glass 전용**.

### 운영 중인 루틴

| 항목 | 값 |
|---|---|
| trigger_id | `trig_01UPrD29cUaEAUVpb3VZMMMs` |
| 이름 | daily-stock 종합 리포트 (미국장·한국장·하이닉스·지정학) |
| cron | `50 20 * * *` (UTC) = **매일 05:50 KST** 시작, 06:15 완료 목표 |
| model | `claude-opus-4-8` |
| sources | `https://github.com/toyunity/daily-stock` ✅ |
| environment_id | `env_014dEJx6EUdtSFyoJhdezX8b` (Default) |
| persist_session | `false` — **의도한 값**. 매 실행이 레포를 새로 클론하고 HANDOFF를 다시 읽는 게 맞다 |
| 관리 | `RemoteTrigger` {list,get,update,run}. **삭제는 API 불가** → claude.ai/code/routines |

**검증 기록 (2026-07-20T04:24Z Run now):** 클라우드 세션이 레포를 갖고 기동 → 9분 만에
`git push` 성공(커밋 `f444cfb`, author `Claude <noreply@anthropic.com>`) → `finalize-report`
success → `master report ready` + `fanned out to 1 users`.
**→ 클라우드 세션의 git 쓰기 권한 OK.** (DISPATCH.md의 `PUSH_FAILED_USE_MCP` MCP 폴백은
이 환경에 GitHub 커넥터가 없어 **존재하지 않는다**. git push가 유일한 발행 경로다.)

## 6) 알려진 이슈 / 다음 과제

- ⚠️ **KRX 장중 finalize = 장중가 오염.** `getDomesticQuote`는 *현재가*를 반환한다. 한국장 개장
  중(09:00~15:30 KST)에 finalize가 돌면 전일 종가를 서술한 본문에 **장중 가격**이 박혀 모순이
  생긴다. 정규 스케줄(05:50 KST)은 KRX 마감 상태라 **정상**이며, 2026-07-20 13:24 KST 수동
  검증에서만 노출됐다(₩1,805,000/-2.01% ← 7/20 장중 vs 본문 7/16 종가 -11.53%).
  **수동/장중 재실행을 안전하게 만들 계획이면** finalize에 KRX 개장시간 가드를 넣어라.
- ⚠️ **코스피·코스닥·VIX·환율은 KIS 앵커링 대상이 아니다** → 리서치값이 그대로 노출된다.
  `KIS_INDEX_CODE`(finalize.ts)에 국내지수 매핑이 없다. 정확도를 높이려면 KIS 국내지수 API 추가.
- ⚠️ **VIX 미해결**: `.VIX`가 `FHKST03030100`에서 `output2` 빈 배열로 와 unparseable. KIS 미제공으로 추정.
- ⚠️ **겨울 DST**: `20:50 UTC`는 여름(EDT)엔 미국 마감 50분 후지만 **겨울(EST)엔 마감 10분 전**이다
  (KST는 서머타임 없음). **11월 전에 cron 재검토 필요.**

---

## 7) 매일 리포트 프롬프트 (온디맨드용 요약본)

> **정본은 루틴 `trig_01UPrD29cUaEAUVpb3VZMMMs` 안의 프롬프트다.**
> `RemoteTrigger {action:"get"}` 으로 실물을 읽어라. 아래는 손으로 돌릴 때 쓰는 축약본이며,
> 루틴 프롬프트에는 추가로 **①한국장(코스피·코스닥 `^KS11`/`^KQ11` + "한국 증시" 섹션)**,
> **②본문에 파이프라인 언급 금지**(KIS·앵커링·개략값 같은 내부 사정을 독자용 필드에 쓰지 말 것 —
> 2026-07-20 실측에서 `price_context`에 "(수치는 개략값이며…KIS 앵커링으로 갱신)"이 새어나옴) 규칙이 들어 있다.


```
오늘자 미국 증시 리포트를 만들어라. 저장소는 이미 클론돼 있다.

1) git checkout claude/stock-market-report-app-9to46d && git pull --ff-only origin claude/stock-market-report-app-9to46d
2) WebSearch로 리서치(각 사실 출처 URL 확보, 정치성 배제·검증가능한 팩트만):
   - 직전 미국장(가장 최근 거래일): S&P500·나스닥·다우·러셀2000·VIX 마감, 주요 급등락 종목(티커), 실적, 연준/매크로(금리·CPI·고용)
   - 심층분석 대상 SK하이닉스(000660): 주가 동향·상승 동인·하락 리스크·촉매 일정·강세/기본/약세 시나리오(조건+방향). HBM4·엔비디아·삼성·마이크론·중국 CXMT·수급.
   - 메모리 반도체 섹터, 지정학(미국·이란/호르무즈 등 — 발언은 주체에 귀속, 중립 기술)
3) reports/report.json 을 docs/DISPATCH.md 스키마(indices·macro·movers·sector_perf·focus·headline_summary·headlines·sections·geopolitics)대로 한국어로 작성.
   ★ 하이닉스·미국종목·지수 수치는 finalize가 KIS로 정확값을 덮어쓴다. 따라서 focus.price·movers.pct·indices는 개략값+출처로 두고, headline_summary·price_context·thesis 등 서술에는 특정 종가 단정을 피하고 추세·맥락 위주로 써서 KIS 값과 어긋나지 않게 하라. 지어낸 수치 금지, 모든 fact에 실제 출처 URL.
4) 검증: node로 JSON.parse + `npm run -s validate -w @daily-stock/pipeline -- "$(pwd)/reports/report.json"` 로 스키마 확인.
5) git add reports/report.json && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "report($(date -u +%Y-%m-%d)): Claude daily" && git push origin claude/stock-market-report-app-9to46d
   push하면 GitHub Action finalize.yml 이 KIS 시세 앵커링 + 이미지 + Supabase 적재 + 개인화를 자동 처리한다.
6) finalize 최신 run이 success인지 확인(가능하면)하고 한두 줄로 요약 보고. 어느 단계든 실패하면 원인과 함께 보고.
```

## 8) 되는 것 / 안 되는 것 (스냅샷)

| 기능 | 상태 |
|---|---|
| 리포트 생성(Claude, 온디맨드/루틴) | ✅ |
| KIS 시세 정확화(하이닉스·미국종목·지수3) | ✅ |
| KIS 토큰 캐싱(하루 1회, app_kv) | ✅ |
| Supabase 적재·개인화·프론트 표시 | ✅ |
| gpt-4o 베이스라인 | ⚠️ 수동 전용(보정 패스 적용, cron 제거) |
| Claude 매일 무인 자동 | ✅ **완성** — 루틴 `trig_01UPrD29cUaEAUVpb3VZMMMs`, end-to-end 검증됨 |
| 클라우드 세션 git push | ✅ 검증됨(커밋 `f444cfb`) |
| 한국장(코스피·코스닥) 커버리지 | ✅ 리포트 포함 — 단 KIS 앵커링 대상 아님(§6) |
| 코스피·VIX 시세 앵커링 | ❌ 미구현 — 리서치값 그대로 |

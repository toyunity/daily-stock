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

## 5) 자동화 — 결론 (중요)

- ❌ **Claude 예약 트리거 / `fire_trigger`** = 레포 없는 **새 세션**을 띄워 실패(4회 확인). MCP `create_trigger`는 레포를 소스로 못 붙임.
- ⚠️ **`send_later` 자기-연쇄** = 이 세션을 재개(레포 있음)하나, 한 번 끊기면 정지 → **연속 보장 X**.
- ✅ **정답 = Claude Routine**([claude.ai/code/routines](https://claude.ai/code/routines)): 루틴 생성 시 **레포를 붙여** 매일 예약 세션이 레포를 갖고 뜸 = 진짜 매일 무인 + Claude 두뇌. (문서 확인)
- **gpt-4o `daily-report.yml`** = cron 제거, **수동 break-glass 전용**(루틴이 어느 날 실패 시 손으로 실행).

## 6) 남은 할 일 (딱 하나)

**사용자가 Routine 생성:** claude.ai/code/routines → New routine →
프롬프트=아래 §7 → **repo `toyunity/daily-stock` 첨부** → Environment Default →
Schedule **매일 05:50 KST** → Create → **Run now로 1회 검증**(레포 갖고 뜨는지, push→finalize 성공하는지).

---

## 7) 루틴에 넣을 매일 리포트 프롬프트

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
| Claude 매일 무인 자동 | ⏳ **Routine 생성으로 완성 예정** |

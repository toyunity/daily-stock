# 디스패치 런북 (Max 구독으로 매일 리포트, API 비용 0)

이 환경은 egress 정책상 **Supabase·뉴스 사이트에 직접 접속하지 못합니다**(403). 대신 열려 있는 것:
- **WebSearch** (리서치 — Anthropic 서버 경유, 정상 작동)
- **git push / GitHub** (정상)
- **Claude 추론** (Max)

그래서 흐름은 **git push를 다리**로 사용합니다:

```
매일 06:15 KST → 예약 Claude 세션 (Max, $0)
  1) WebSearch로 미국 증시 리서치
  2) Claude가 정치성 제거·출처 부착 → reports/report.json 생성
  3) git commit + push
        │  (reports/report.json push 감지)
        ▼
  GitHub Action finalize.yml (오픈 네트워크)
  4) 시세 조회 + 이미지 렌더 + Supabase 적재 + 사용자별 개인화
        ▼
  프론트: Supabase 조회 (RLS = 승인자만)
```

- LLM/리서치 = 디스패치(Max, 무료). Supabase 쓰기 = GitHub Action(LLM 없음, 무료).

---

## 사전 준비 (1회)

**GitHub 저장소 Secrets** (Settings → Secrets and variables → Actions → New repository secret):
- `SUPABASE_URL` = `https://YOUR-PROJECT.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` = service_role 키

> 이 둘만 있으면 finalize가 Supabase에 씁니다. LLM 키는 필요 없습니다(디스패치가 Max로 처리).
> (선택) AI 헤더 이미지를 켜려면 Variables에 `AI_HEADER_ENABLED=true`.

---

## 예약 트리거가 매일 실행하는 프롬프트

아래 프롬프트가 매일 06:15 KST에 새 세션으로 실행됩니다:

````text
너는 매일 미국 증시 리포트를 만드는 자동화 에이전트다. 아래를 순서대로 수행하라.

1) 저장소 준비:
   - cd /home/user/daily-stock && git fetch origin && git checkout claude/stock-market-report-app-9to46d && git pull --ff-only origin claude/stock-market-report-app-9to46d

2) 리서치 (WebSearch 사용, 5~10회):
   - 직전 미국장(가장 최근 거래일)의 지수 마감: S&P500, Nasdaq, Dow, Russell2000, VIX
   - 주요 급등락 종목(티커 포함), 실적 발표, 연준/매크로(금리·CPI·고용 등)
   - 섹터별 이슈: 기술, 메모리 반도체(마이크론 MU·SK하이닉스 000660.KS·삼성전자 005930.KS·WDC 등 DRAM/NAND/HBM, 중국 CXMT 동향 포함), 금융, 에너지, 헬스케어 등
   - 지정학/전쟁: 주요 분쟁(미국·이란/중동, 우크라이나 등)의 최신 전개 — 정상·정부·군(트럼프 발언, 이란 정부·혁명수비대 IRGC 성명·행동 등)의 발언·행동과 시장 파급. 발언은 반드시 해당 주체에 귀속.
   - ★ 심층 분석 대상(기본: SK하이닉스 000660.KS): 현재가·등락, 52주 고점/저점·연초대비, 최근 주가 추이(수치), 애널리스트 컨센서스·목표가, 상승 동인/하락 리스크, 촉매 일정, 강세·기본·약세 시나리오(조건+방향)를 리서치. HBM4·엔비디아·삼성·마이크론·CXMT·수급/사이클을 함께 파악.
   - 각 사실의 출처 URL을 반드시 확보. 정치적 논평·추측·감정적 수식어는 제외하고 검증 가능한 사실만.

3) reports/report.json 파일을 아래 JSON 스키마로 정확히 작성(그 외 텍스트 금지):
   {
     "indices": IndexQuote[],                   // 주요 지수 종가(리서치한 값)
     "macro": [{ "label","value","unit","change" }],       // 10Y·2Y·WTI·Brent·Fed 등
     "movers": { "gainers":[{"ticker","pct"}], "losers":[{"ticker","pct"}] },
     "sector_perf": [{ "sector"?, "label", "pct" }],       // 섹터 등락(히트맵)
     "focus": FocusAnalysis,                    // ★ 심층 분석(기본 SK하이닉스) — 주가 동향+시나리오
     "headline_summary": string,               // 중립적 한 문단 요약(한국어, 심층분석 대상을 중심으로)
     "headlines": Fact[],                       // 가장 중요한 사실 6~10개
     "sections": Section[],                     // 섹터/테마별 그룹 3~6개
     "geopolitics": GeoBrief                    // 지정학/전쟁 브리핑 (분쟁이 있을 때)
   }
   IndexQuote = { "name": string, "symbol": string, "value": number, "change_pct": number, "change_abs": number }
   Fact = {
     "fact": string,
     "sources": [{ "name": string, "url": string }],   // 반드시 실제 검색 출처
     "tickers": string[],
     "sector"?: "tech"|"memory"|"finance"|"energy"|"healthcare"|"consumer"|"industrials"|"materials"|"utilities"|"realestate"|"communication",
     "topic": "macro"|"earnings"|"fed"|"ipo"|"m&a"|"guidance"|"regulation"|"commodities"|"crypto"|"other"
   }
   Section = { "title": string, "sector"?: Sector, "facts": Fact[] }
   FocusAnalysis = {
     "ticker","name",
     "price": { "value":number,"currency":"KRW"|"USD","change_pct":number,"change_abs":number,"as_of":string },
     "price_context": string,                  // 52주 고저·연초대비 등
     "price_series": [{ "label","value" }],     // 주가 추이(2점 이상)
     "thesis": string,                          // 핵심 논지(간단 <b> 강조 가능)
     "rating": string,                          // 컨센서스 등급
     "target": { "avg":number,"high":number,"low":number,"currency":string },
     "drivers": [{ "point","source":{"name","url"} }],   // 상승 동인
     "risks":   [{ "point","source":{"name","url"} }],   // 하락 리스크
     "catalysts":[{ "date","event" }],
     "scenarios":[{ "kind":"bull"|"base"|"bear","label","condition","implication" }],
     "watch": string[]
   }
   GeoBrief = {
     "headline": string, "theater": string, "summary": string,
     "escalation_level": 1~5,                   // 1 완화 … 5 전면전
     "escalation_label": string,                // 현 수위 짧은 라벨
     "actors": [{ "name","role","stance":"hard"|"mixed"|"soft","quotes":[{"text","source":{"name","url"}}] }],
     "timeline": [{ "date","title","detail","severity":"normal"|"high","sources":[{"name","url"}] }],
     "market_note": string,                     // 시장 파급 요약
     "oil_series": [{ "label","value" }],       // 유가 추이(미니차트, 2점 이상)
     "watchpoints": string[]
   }
   규칙: 원문에 없는 수치를 지어내지 말 것. 모든 fact/quote에 실제 출처. 메모리 반도체는 sector "memory". 발언은 주체에 귀속하고 중립적으로 기술.

4) 검증 & 발행은 스크립트 하나로: `bash scripts/publish-report.sh`
   이 스크립트가 (a) JSON·스키마 검증 → (b) 커밋 → (c) `git push`(지수 백오프 재시도)까지 결정적으로 처리한다.
   **스크립트 마지막 줄(신호)에 따라 분기하라:**
   - `PUBLISH_OK` → 푸시 성공. finalize.yml이 자동 적재한다. 끝.
   - `NO_CHANGES` → report.json에 바뀐 내용 없음(같은 날 재실행 등). 할 일 없음.
   - `INVALID_JSON` / `SCHEMA_INVALID` → report.json을 고쳐 다시 실행.
   - `PUSH_FAILED_USE_MCP sha=<BLOBSHA> path=reports/report.json branch=<BR>`
     → **이 컨테이너에 git push(write) 권한이 없다는 뜻.** 절대 포기하지 말고, 계정 인증을 쓰는
       **GitHub MCP 브릿지**로 같은 파일을 발행하라(로컬 git 프록시를 우회한다):

       mcp__github__create_or_update_file(
         owner   = "toyunity",
         repo    = "daily-stock",
         branch  = "claude/stock-market-report-app-9to46d",
         path    = "reports/report.json",
         content = <reports/report.json 파일 전체 텍스트>,
         message = "chore(report): <오늘 날짜> dispatch report",
         sha     = <위 신호의 BLOBSHA>          // 기존 파일 갱신이므로 필수
       )

       이 커밋은 사용자(toyunity) 명의라 finalize.yml이 정상 발화한다. (검증됨)
       만약 mcp__github__ 도구가 이 세션에 없다면, 그 사실을 원인으로 명시해 보고하라
       (예약 세션에 GitHub 커넥터가 로드되지 않은 것).

푸시(또는 MCP 발행)가 성공하면 GitHub Action finalize.yml이 자동으로 Supabase에 적재한다.
끝나면 어떤 경로(push / MCP)로 발행했는지와 함께 한두 줄로 요약 보고하라.
````

---

## 발행 경로 요약 (push 우회 설계)

git push 인증은 **세션 컨테이너의 로컬 프록시**에 묶여 있어, 예약된 새 컨테이너엔 write 권한이
없을 수 있다. 그래서 발행은 이중화돼 있다:

1. **1차: `scripts/publish-report.sh`** — 검증 + 커밋 + `git push`(백오프 재시도). push 권한이 있으면 여기서 끝.
2. **2차(폴백): GitHub MCP `create_or_update_file`** — 계정 인증으로 API 커밋. 컨테이너 프록시를 우회한다.
   스크립트가 `PUSH_FAILED_USE_MCP sha=...`를 출력하면 그 sha로 MCP 발행. (실측 검증됨)

두 경로 모두 사용자 명의 커밋 → `finalize.yml`(`on: push` reports/report.json)이 정상 발화한다.

## 수동 테스트

1. 위 프롬프트를 이 세션에서 직접 실행 → `bash scripts/publish-report.sh`로 발행 확인
2. GitHub → Actions → **finalize-report** 실행 성공 확인
3. Supabase → Table Editor → `daily_reports` 에 오늘 날짜 행(status=ready) 확인
4. 앱 새로고침 → 리포트 표시 확인

## 트리거 관리
- 생성/수정/삭제는 `create_trigger` / `update_trigger` / `delete_trigger` (cron: `15 21 * * *` = 06:15 KST)
- 수동 1회 실행: `fire_trigger`

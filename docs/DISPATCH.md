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
   - 섹터별 이슈: 기술, 메모리 반도체(MU 등 DRAM/NAND/HBM), 금융, 에너지, 헬스케어 등
   - 각 사실의 출처 URL을 반드시 확보. 정치적 논평·추측·감정적 수식어는 제외하고 검증 가능한 사실만.

3) reports/report.json 파일을 아래 JSON 스키마로 정확히 작성(그 외 텍스트 금지):
   {
     "indices": IndexQuote[],                   // 주요 지수 종가(리서치한 값)
     "headline_summary": string,               // 중립적 한 문단 요약(한국어)
     "headlines": Fact[],                       // 가장 중요한 사실 6~10개
     "sections": Section[]                      // 섹터/테마별 그룹 3~6개
   }
   IndexQuote = { "name": string, "symbol": string, "value": number, "change_pct": number, "change_abs": number }
   // 예: S&P500, 나스닥 종합, 다우존스, 러셀2000, VIX (WebSearch로 확인한 종가/등락)
   Fact = {
     "fact": string,                            // 한국어, 사실 1건
     "sources": [{ "name": string, "url": string }],   // 반드시 실제 검색 출처
     "tickers": string[],
     "sector"?: "tech"|"memory"|"finance"|"energy"|"healthcare"|"consumer"|"industrials"|"materials"|"utilities"|"realestate"|"communication",
     "topic": "macro"|"earnings"|"fed"|"ipo"|"m&a"|"guidance"|"regulation"|"commodities"|"crypto"|"other"
   }
   Section = { "title": string, "sector"?: Sector, "facts": Fact[] }
   규칙: 원문에 없는 수치를 지어내지 말 것. 모든 fact에 출처가 있어야 함. 메모리 반도체 관련은 sector를 "memory"로.

4) 검증: reports/report.json이 위 스키마의 유효한 JSON인지 확인(node -e 로 JSON.parse 체크).

5) 커밋 & 푸시:
   - git add reports/report.json
   - git -c user.name="daily-stock-dispatch" -c user.email="dispatch@local" commit -m "chore(report): $(date -u +%Y-%m-%d) dispatch report"
   - git push origin claude/stock-market-report-app-9to46d

푸시가 성공하면 GitHub Action finalize.yml이 자동으로 Supabase에 적재한다. 끝나면 간단히 요약 보고하라.
````

---

## 수동 테스트

1. 위 프롬프트를 이 세션에서 직접 실행 → `reports/report.json` 생성·push 확인
2. GitHub → Actions → **finalize-report** 실행 성공 확인
3. Supabase → Table Editor → `daily_reports` 에 오늘 날짜 행(status=ready) 확인
4. 앱 새로고침 → 리포트 표시 확인

## 트리거 관리
- 생성/수정/삭제는 `create_trigger` / `update_trigger` / `delete_trigger` (cron: `15 21 * * *` = 06:15 KST)
- 수동 1회 실행: `fire_trigger`

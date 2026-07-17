# Daily Stock Report — 개발 구현 프롬프트

> 이 문서는 "매일 아침 미국 주식 동향 + 공신력 있는 보도자료를 팩트 기반으로 취합·시각화해 인증된 사용자에게 리포트로 제공하는 서비스"를 처음부터 끝까지 구현하기 위한 개발 프롬프트입니다.
> AI 코딩 에이전트(또는 개발자)에게 그대로 전달해 실행할 수 있도록 작성되었습니다.

---

## 0. 역할과 목표 (Role & Goal)

당신은 풀스택 개발 에이전트다. 아래 명세를 만족하는 **프로덕션 수준의 웹 서비스**를 구현하고, 무료 인프라에 배포까지 완료하라. 각 단계마다 실행 가능한 코드를 작성하고, 로컬에서 검증한 뒤 커밋한다.

**한 줄 요약**: 매일 06:15(Asia/Seoul)에 미국 증시 동향과 공신력 있는 최신 보도자료를 자동 수집 → LLM으로 정치 성향을 제거한 팩트 기반 요약 → 차트/이미지로 시각화한 리포트를 생성 → 사용자가 선택한 관심 분야에 맞춰 인증된 사용자에게 제공한다.

---

## 1. 핵심 요구사항 (Requirements)

1. **자동 스케줄**: 매일 오전 06:15 (Asia/Seoul, = 21:15 UTC 전날) 리포트 파이프라인 자동 실행.
2. **데이터 수집**: 미국 증시 시세/지표 + 공신력 있는 최신 보도자료·주식 기사 취합.
3. **팩트 기반 정제**: LLM으로 정치적 편향·논평·추측을 제거하고 **검증 가능한 사실만** 남긴다. 각 항목에 출처 링크를 부착한다.
4. **리포트 생성**: 이해하기 쉬운 리포트 형태. 기본은 **인터랙티브 차트(Recharts)**, 공유·썸네일용은 **서버에서 생성한 리포트 카드 이미지(SVG→PNG)**. 헤더 일러스트는 **AI 이미지 생성 옵션**으로 제공.
5. **관심 분야 선택**: 사용자가 관심 분야/섹터/티커를 직접 선택하고, 그에 맞춰 개인화된 리포트를 받는다.
6. **인증**: Supabase Auth(구글 OAuth + 이메일 매직링크). **승인된 사용자만** 접근(allowlist/승인 플래그).
7. **프론트엔드**: React (Vite + TypeScript).
8. **백엔드/DB**: Supabase (Postgres + Auth + Storage + Edge Functions).
9. **배포**: 전부 **무료 티어**로 배포. (프론트: Vercel, 백엔드/DB: Supabase, 스케줄러: GitHub Actions)
10. **LLM**: Claude API 활용(요약·편향 제거·구조화·차트 데이터 정형화).

---

## 2. 기술 스택 (Tech Stack) — 무료 티어 확정

| 레이어 | 선택 | 비고 |
|---|---|---|
| 프론트엔드 | React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui | Vercel 무료 배포 |
| 차트 | Recharts | 클라이언트 인터랙티브 시각화 |
| 상태/데이터 | TanStack Query + Supabase JS Client | |
| 인증 | Supabase Auth (Google OAuth, Magic Link) | 무료 |
| DB | Supabase Postgres + Row Level Security(RLS) | 무료 500MB |
| 파일 저장 | Supabase Storage | 리포트 카드 PNG / AI 이미지 |
| 백엔드 로직 | Supabase Edge Functions (Deno) | 수집·요약·생성 파이프라인 |
| 스케줄러 | GitHub Actions cron | 매일 21:15 UTC → Edge Function 트리거 |
| 이미지 렌더 | Satori + resvg (SVG→PNG) | Edge Function 내부 |
| AI 이미지(옵션) | 이미지 생성 API (헤더 일러스트) | 실패 시 그레이스풀 폴백 |
| LLM | Claude API (`claude-opus-4-8` / `claude-sonnet-5`) | 요약·정제·정형화 |

> **비용 제약**: 모든 외부 데이터는 무료 API 티어 + 공신력 RSS 조합으로만 운영한다. 유료 전제 서비스는 사용하지 않는다. API 키가 없으면 해당 소스를 건너뛰고 로그를 남긴다(파이프라인이 죽지 않는다).

---

## 3. 데이터 소스 (무료 API + 공신력 RSS 혼합)

### 3.1 시세·지표 (Market Data)
- **Finnhub** (무료): 실시간 지수/종목 시세, 회사 뉴스.
- **Alpha Vantage** (무료): 지수/종목 일별 시세, 섹터 퍼포먼스.
- **(폴백)** Stooq / Yahoo Finance 비공식 엔드포인트: 키 없이 지수(^GSPC, ^IXIC, ^DJI) 종가 백업.

수집 대상(기본): S&P500, Nasdaq Composite, Dow Jones, 러셀2000, VIX, 미 10년물 금리, WTI, 금, DXY, 주요 빅테크(AAPL, MSFT, NVDA, GOOGL, AMZN, META, TSLA).

### 3.2 뉴스·보도자료 (공신력 소스 우선)
공신력 있는 1차/통신사·규제기관 소스를 우선한다:
- **Reuters / AP** RSS (통신사, 사실 보도 중심)
- **SEC EDGAR** 최신 8-K/보도자료 피드 (1차 규제 공시 — 최고 신뢰도)
- **PR Newswire / Business Wire** RSS (기업 공식 보도자료)
- **Finnhub / Marketaux company-news API** (종목 연결 뉴스)
- (보조) NASDAQ, Nasdaq Trader, Federal Reserve 보도자료 RSS

각 기사에는 반드시 `{source, url, published_at}`를 보존한다. **출처 없는 항목은 리포트에 넣지 않는다.**

### 3.3 소스 어댑터 패턴
소스별 구현을 `SourceAdapter` 인터페이스로 추상화하여 소스 추가/제거가 쉬운 구조로 만든다.
```ts
interface RawItem { title: string; body: string; url: string; source: string; publishedAt: string; tickers?: string[]; }
interface SourceAdapter { id: string; fetch(params): Promise<RawItem[]>; }
```
소스는 설정(`sources.config.ts`)으로 on/off. 키 미존재 시 자동 skip.

---

## 4. 팩트 기반 정제 파이프라인 (핵심 로직)

수집된 원자료를 Claude API로 정제한다. **정치적 편향 제거 + 사실만 추출**이 핵심 가치.

### 4.1 파이프라인 단계
1. **수집(Ingest)**: 모든 SourceAdapter 병렬 호출 → `raw_items` 저장(중복 URL dedupe).
2. **필터(Filter)**: 최근 24h + 미국 증시 관련만. 오피니언/사설 섹션 소스는 낮은 가중치.
3. **정제(Refine, LLM)**: 각 기사군을 Claude에 전달하여 아래를 수행:
   - 정치적 프레이밍·논평·형용사적 추측 제거
   - 검증 가능한 **사실(수치, 발표, 공시, 발언 인용)** 만 bullet로 추출
   - 각 사실에 출처 URL 매핑 (환각 방지: **원문에 없는 수치는 생성 금지**)
   - 중립성 점검: 좌/우 프레이밍 단어 감지 시 중립 표현으로 치환
4. **정형화(Structure, LLM)**: 리포트 JSON 스키마로 변환(아래 §5.3). 차트용 수치 데이터 포함.
5. **시각화(Render)**: 차트 데이터 + Satori로 리포트 카드 PNG 생성 → Storage 업로드.
6. **개인화(Personalize)**: 사용자별 관심 분야 필터로 섹션 재구성 → `user_reports` 생성.

### 4.2 편향 제거 프롬프트(시스템 프롬프트 예시)
```
You are a neutral financial fact-extraction engine. From the provided articles,
extract ONLY verifiable facts relevant to US equity markets: numbers, official
announcements, regulatory filings, direct quotes, and reported events.

RULES:
- Remove ALL political framing, editorializing, speculation, and loaded adjectives.
- Do NOT invent any number, date, or fact not present in the source text.
- Every fact MUST cite its source URL.
- If two sources conflict, present both with attribution; do not adjudicate.
- Output must be neutral, terse, and attributable.
Return strict JSON matching the provided schema.
```
- LLM 출력은 **JSON 스키마 강제**(tool/structured output) 후 서버에서 검증. 스키마 불일치 시 재요청.
- **환각 방지**: 추출된 수치는 원문 텍스트에 문자열로 존재하는지 후처리 검증(가능 범위 내).

---

## 5. 데이터 모델 (Supabase Postgres)

### 5.1 테이블
```sql
-- 사용자 프로필 (승인 게이트)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  is_approved boolean not null default false,   -- 승인된 사용자만 리포트 접근
  role text not null default 'user',            -- 'user' | 'admin'
  created_at timestamptz default now()
);

-- 관심 분야 설정
create table preferences (
  user_id uuid primary key references profiles(id) on delete cascade,
  sectors text[] default '{}',        -- 예: {tech, energy, finance, healthcare}
  tickers text[] default '{}',        -- 예: {AAPL, NVDA}
  topics text[] default '{}',         -- 예: {earnings, macro, fed, ipo, m&a}
  delivery_channels text[] default '{web}', -- {web, email}
  updated_at timestamptz default now()
);

-- 원자료 (수집 로그)
create table raw_items (
  id bigint generated always as identity primary key,
  url text unique not null,
  source text not null,
  title text, body text,
  tickers text[], published_at timestamptz,
  fetched_at timestamptz default now()
);

-- 일별 마스터 리포트 (모든 사용자 공통 베이스)
create table daily_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null unique,       -- 미국장 기준 날짜
  content jsonb not null,                  -- §5.3 스키마
  cover_image_url text,                    -- AI 헤더 이미지(옵션)
  card_image_url text,                     -- Satori 리포트 카드 PNG
  status text default 'ready',             -- 'building'|'ready'|'failed'
  created_at timestamptz default now()
);

-- 사용자별 개인화 리포트
create table user_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  daily_report_id uuid references daily_reports(id) on delete cascade,
  report_date date not null,
  content jsonb not null,                  -- 관심 분야로 필터/재정렬된 뷰
  read_at timestamptz,
  created_at timestamptz default now(),
  unique(user_id, report_date)
);
```

### 5.2 RLS (Row Level Security) — 인증/인가 핵심
```sql
alter table profiles enable row level security;
alter table preferences enable row level security;
alter table user_reports enable row level security;
alter table daily_reports enable row level security;

-- 승인된 사용자만 마스터 리포트 읽기
create policy "approved read reports" on daily_reports for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_approved));

-- 본인 데이터만
create policy "own prefs" on preferences for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own user_reports" on user_reports for select
  using (user_id = auth.uid());
create policy "own profile" on profiles for select using (id = auth.uid());
```
- 신규 가입 시 `profiles` 자동 생성 트리거(`is_approved=false`). 관리자가 승인 전까지 리포트 접근 차단.
- 파이프라인(Edge Function)은 **service_role 키**로 RLS 우회하여 쓰기.

### 5.3 리포트 JSON 스키마 (`content`)
```jsonc
{
  "date": "2026-07-16",
  "market_summary": {
    "indices": [{"name":"S&P 500","value":5432.1,"change_pct":-0.42,"change_abs":-23.0}],
    "movers": {"gainers":[{"ticker":"NVDA","pct":3.1}], "losers":[]},
    "macro": [{"label":"US 10Y","value":4.28,"unit":"%","change":0.03}]
  },
  "headlines": [
    {"fact":"...", "sources":[{"name":"Reuters","url":"..."}], "tickers":["AAPL"], "topic":"earnings"}
  ],
  "sections": [
    {"title":"Tech","facts":[/* headline refs */], "chart": {"type":"bar","data":[...]}}
  ],
  "neutrality_note": "정치적 논평은 제거되었으며 모든 항목에 출처가 있습니다.",
  "disclaimer": "본 리포트는 정보 제공 목적이며 투자 권유가 아닙니다."
}
```

---

## 6. 시각화 (차트 기본 + AI 이미지 옵션)

### 6.1 인터랙티브 차트 (웹, 기본)
- Recharts로 지수 변동(라인/바), 섹터 히트맵, 등락 상위(수평 바), 매크로 지표 카드.
- **색상·접근성**: 상승/하락은 색 + 부호/아이콘 동시 표기(색맹 접근성). 라이트/다크 모드 모두 지원.
- 반응형: 모바일에서 가로 스크롤 컨테이너 처리.

### 6.2 리포트 카드 이미지 (공유·썸네일·이메일용, 기본)
- Edge Function에서 **Satori**로 JSX→SVG, **resvg-wasm**으로 SVG→PNG 렌더.
- 요약 지표 + 핵심 헤드라인 3~5개 + 날짜/브랜딩을 담은 1080×1350 카드.
- Supabase Storage 업로드 후 `card_image_url` 저장. 카카오/슬랙 공유 및 이메일 본문에 사용.

### 6.3 AI 헤더 일러스트 (옵션)
- 그날의 시장 무드(상승/하락/혼조)를 반영한 **추상적·중립적** 헤더 이미지를 이미지 생성 API로 생성.
- **가드레일**: 실제 인물/로고/차트 수치 위조 금지, 추상 일러스트만. 생성 실패·비용 초과 시 정적 그라디언트 배너로 **그레이스풀 폴백**.
- 사용자 설정에서 on/off 가능(기본 off로 비용 보호).

---

## 7. 스케줄러 (무료, 06:15 KST)

**GitHub Actions cron**으로 매일 21:15 UTC(=06:15 Asia/Seoul) 실행:
```yaml
# .github/workflows/daily-report.yml
name: daily-report
on:
  schedule:
    - cron: "15 21 * * *"   # 21:15 UTC = 06:15 KST
  workflow_dispatch: {}      # 수동 트리거
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger pipeline
        run: |
          curl -fsS -X POST "$SUPABASE_FN_URL/build-daily-report" \
            -H "Authorization: Bearer $PIPELINE_SECRET" \
            -H "Content-Type: application/json" --max-time 600
        env:
          SUPABASE_FN_URL: ${{ secrets.SUPABASE_FN_URL }}
          PIPELINE_SECRET: ${{ secrets.PIPELINE_SECRET }}
```
- GitHub cron은 지연될 수 있으므로 Function 내부에서 **멱등성**(같은 `report_date` 재실행 시 upsert) 보장.
- `workflow_dispatch`로 수동 재생성 가능. 실패 시 재시도(백오프).
- (대안) Supabase `pg_cron` + `pg_net`로 DB 내부 스케줄도 가능. 기본은 GitHub Actions.

---

## 8. Edge Functions (백엔드 API)

| Function | 역할 | 인증 |
|---|---|---|
| `build-daily-report` | 전체 파이프라인(수집→정제→정형→렌더→개인화) | `PIPELINE_SECRET` 헤더 |
| `personalize` | 특정 사용자 관심사 변경 시 리포트 재구성 | 사용자 JWT |
| `admin-approve` | 관리자: 사용자 승인/차단 | admin JWT |
| `get-report` | (선택) 서버측 집계 조회 | 사용자 JWT + RLS |

- 파이프라인은 단계별로 상태(`daily_reports.status`) 갱신, 실패 시 부분 결과 저장 + 알림 로그.
- 외부 API 호출은 타임아웃/재시도/레이트리밋 가드. 한 소스 실패가 전체를 막지 않도록 `Promise.allSettled`.
- 비밀키(Claude, Finnhub, 이미지 API, service_role)는 **Edge Function 환경변수**로만. 프론트 노출 금지.

---

## 9. 프론트엔드 (React) 화면 구성

1. **로그인** (`/login`): 구글 OAuth + 매직링크. 미승인 사용자는 "승인 대기" 안내 화면.
2. **온보딩** (`/onboarding`): 관심 섹터·티커·토픽 선택(멀티셀렉트 칩). `preferences` 저장.
3. **오늘의 리포트** (`/`): 요약 헤더 → 지수 카드 → 인터랙티브 차트 → 섹션별 팩트(출처 링크 배지) → 카드 이미지 다운로드/공유.
4. **아카이브** (`/reports`): 날짜별 과거 리포트 목록/검색.
5. **설정** (`/settings`): 관심 분야 수정, AI 헤더 on/off, 이메일 수신 토글.
6. **관리자** (`/admin`): 가입자 승인/차단, 파이프라인 수동 실행, 최근 실행 로그.

- 라우팅: 미승인/비로그인 접근 시 가드(ProtectedRoute + RLS 이중 방어).
- UX: 로딩 스켈레톤, 빈 상태, 에러 바운더리. 다크모드. 모바일 우선 반응형.
- 각 팩트 항목에 **출처 배지**(클릭 시 원문). 신뢰성 강조가 제품 핵심.

---

## 10. 보안·컴플라이언스

- 모든 비밀키는 서버(Edge Function/GitHub Secrets)에만. 프론트에는 Supabase `anon key`만.
- RLS로 데이터 접근 이중 방어(프론트 가드 + DB 정책).
- 파이프라인 엔드포인트는 `PIPELINE_SECRET`으로 보호.
- **면책 고지**: 모든 리포트에 "정보 제공 목적, 투자 권유 아님" 명시.
- 저작권: 기사 **전문 저장/재배포 금지**. 사실 요약 + 원문 링크만 제공(출처 표기 필수).
- 이미지 생성물은 추상 일러스트로 한정(실존 인물/브랜드 위조 금지).

---

## 11. 무료 배포 절차 (Deliverables)

1. **Supabase 프로젝트** 생성 → 마이그레이션(`supabase/migrations/*.sql`) 적용 → RLS/트리거 설정 → Edge Functions 배포(`supabase functions deploy`) → 환경변수 설정.
2. **Vercel** 프로젝트 연결 → 프론트(`apps/web`) 자동 배포 → `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 설정.
3. **GitHub Actions** Secrets(`SUPABASE_FN_URL`, `PIPELINE_SECRET`) 설정 → cron 워크플로 활성화.
4. **구글 OAuth** 클라이언트 생성 → Supabase Auth Provider에 등록 → 리다이렉트 URL 설정.
5. **스모크 테스트**: `workflow_dispatch`로 파이프라인 1회 실행 → 리포트 생성 확인 → 승인 사용자 로그인 → 리포트 열람 확인.

---

## 12. 리포지토리 구조

```
daily-stock/
├─ apps/web/                  # React + Vite 프론트
│  ├─ src/{pages,components,charts,lib,hooks}
├─ supabase/
│  ├─ migrations/*.sql        # 스키마 + RLS + 트리거
│  ├─ functions/
│  │  ├─ build-daily-report/  # 파이프라인
│  │  ├─ personalize/
│  │  └─ admin-approve/
│  └─ config.toml
├─ packages/shared/           # 타입, 리포트 스키마(zod), 소스 어댑터
│  ├─ sources/                # Finnhub, AlphaVantage, RSS adapters
│  ├─ llm/                    # Claude 프롬프트/스키마
│  └─ render/                 # Satori 카드 템플릿
├─ .github/workflows/daily-report.yml
└─ README.md                  # 셋업/배포 가이드
```

---

## 13. 구현 순서 (권장 로드맵)

1. 모노레포 + Supabase 로컬 셋업, 스키마/RLS 마이그레이션.
2. `packages/shared`: 리포트 zod 스키마, 소스 어댑터(먼저 무료 시세 1개 + RSS 1개), Claude 정제 프롬프트.
3. `build-daily-report` Edge Function: 수집→정제→정형→저장(이미지 렌더는 후순위 스텁).
4. 프론트: 인증 + 온보딩 + 오늘의 리포트(차트) → 실제 데이터로 렌더.
5. Satori 카드 이미지 + Storage 업로드.
6. 개인화(관심 분야 필터) + 아카이브 + 관리자 승인.
7. AI 헤더 이미지 옵션(폴백 포함).
8. GitHub Actions cron 연결 + 무료 배포 + 스모크 테스트.
9. README에 셋업/운영 문서화.

---

## 14. 완료 기준 (Definition of Done)

- [ ] 06:15 KST cron이 매일 리포트를 자동 생성한다.
- [ ] 모든 팩트에 출처가 있고 정치적 논평이 제거되어 있다.
- [ ] 사용자가 관심 분야를 선택하면 리포트가 개인화된다.
- [ ] 차트 + 리포트 카드 이미지가 렌더링된다(AI 헤더는 옵션/폴백).
- [ ] 승인된 사용자만 로그인·열람 가능(RLS + 프론트 가드).
- [ ] Vercel + Supabase + GitHub Actions 전부 무료 티어로 배포·동작.
- [ ] README만 보고 재현 배포가 가능하다.

---

### 부록 A. 필요한 환경변수
```
# 프론트(Vercel)
VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
# Edge Functions(Supabase)
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
FINNHUB_API_KEY, ALPHAVANTAGE_API_KEY
IMAGE_API_KEY            # AI 헤더(옵션)
PIPELINE_SECRET          # cron 트리거 보호
# GitHub Actions Secrets
SUPABASE_FN_URL, PIPELINE_SECRET
```

### 부록 B. 무료 티어 한계 대응
- Finnhub/Alpha Vantage 분당 호출 제한 → 배치 사이 sleep + 캐시.
- Supabase Edge Function 실행 시간 제한 → 파이프라인을 단계별로 분리 호출 가능하게 설계.
- Claude 토큰 절약 → 기사 dedupe/클러스터링 후 요약, 프롬프트 캐싱 활용.
- 이미지 생성 비용 → 기본 off, 사용자 opt-in, 실패 시 정적 폴백.

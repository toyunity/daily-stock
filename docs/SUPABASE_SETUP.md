# Supabase 세팅 런북

Daily Stock Report의 백엔드(Postgres + Auth + Storage)를 무료 티어로 세팅하는 상세 가이드.
소요 시간 약 20~30분. Docker 없이 **대시보드 + SQL 에디터**만으로 완료할 수 있습니다.

---

## 0. 준비물

- Supabase 계정 (GitHub 로그인 가능)
- 우리 저장소의 마이그레이션 파일 2개
  - `supabase/migrations/0001_init.sql`
  - `supabase/migrations/0002_storage_and_admin.sql`
- (선택) Google OAuth를 쓸 경우 Google Cloud 콘솔 접근

---

## 1. 프로젝트 생성

1. https://supabase.com → **Sign in** → **New project**
2. 입력:
   - **Name**: `daily-stock`
   - **Database Password**: 강력한 비밀번호 생성 후 **안전한 곳에 보관** (DB 직접 접속 시 필요)
   - **Region**: 사용자와 가까운 곳 (한국이면 `Northeast Asia (Seoul)` 또는 `Tokyo`)
   - **Plan**: **Free**
3. **Create new project** → 1~2분 프로비저닝 대기

> 무료 플랜은 7일 무활동 시 자동 일시정지되지만, 우리 파이프라인이 매일 DB에 쓰므로 정지되지 않습니다.

---

## 2. API 키 확보 (어디에 쓰는지 표시)

좌측 사이드바 **Project Settings (톱니) → API** 로 이동. 3가지를 복사합니다:

| 항목 | 위치 | 쓰이는 곳 | 노출 |
|---|---|---|---|
| **Project URL** | `https://xxxx.supabase.co` | 프론트 `VITE_SUPABASE_URL`, 파이프라인 `SUPABASE_URL` | 공개 OK |
| **anon public** | Project API keys | 프론트 `VITE_SUPABASE_ANON_KEY` | 공개 OK (RLS로 보호) |
| **service_role** | Project API keys (🔒 secret) | 파이프라인/디스패치 `SUPABASE_SERVICE_ROLE_KEY` | **절대 프론트 노출 금지** |

> `service_role`은 RLS를 우회하는 마스터 키입니다. GitHub Secrets / 예약 세션 환경변수에만 넣고, 브라우저 코드에는 절대 넣지 마세요.

---

## 3. 스키마 · RLS 적용 (SQL 에디터)

좌측 **SQL Editor → New query**.

1. **첫 번째**: `supabase/migrations/0001_init.sql` 파일 전체를 복사해 붙여넣고 **Run**.
   - 생성: `profiles`, `preferences`, `raw_items`, `daily_reports`, `user_reports` 테이블
   - 신규 가입 트리거(`handle_new_user`), 승인 확인 함수(`is_approved`, `is_admin`), RLS 정책
2. **두 번째**: `supabase/migrations/0002_storage_and_admin.sql` 전체를 새 쿼리로 붙여넣고 **Run**.
   - `report-images` 스토리지 버킷 생성 + 공개 읽기 정책
   - 관리자용 profiles 관리 정책

정상 실행 시 `Success. No rows returned` 표시.

### 확인
- **Table Editor** 에서 5개 테이블이 보이는지 확인
- **Authentication → Policies** 에서 각 테이블에 RLS 정책이 있는지 확인
- **Storage** 에 `report-images` 버킷이 있는지 확인

> 대안(CLI): 로컬에 Supabase CLI가 있으면
> `supabase link --project-ref <ref>` 후 `supabase db push` 로 `migrations/`를 한 번에 적용할 수 있습니다.

---

## 4. 인증(Auth) 설정

### 4-1. 이메일 매직링크 (기본, 즉시 사용 가능)
좌측 **Authentication → Providers → Email**:
- **Enable Email provider**: ON
- **Confirm email**: 매직링크만 쓸 거면 꺼도 되고, 켜두면 첫 로그인 시 확인 메일 발송
- 무료 플랜 기본 SMTP는 발송량 제한이 있음(테스트엔 충분). 운영 시 커스텀 SMTP 권장

### 4-2. Google OAuth (선택)
1. **Google Cloud Console** (https://console.cloud.google.com) → 프로젝트 생성/선택
2. **APIs & Services → OAuth consent screen** 설정 (External, 앱 이름/이메일)
3. **Credentials → Create Credentials → OAuth client ID**
   - Type: **Web application**
   - **Authorized redirect URIs** 에 아래 추가:
     ```
     https://<your-ref>.supabase.co/auth/v1/callback
     ```
   - 생성 후 **Client ID** / **Client Secret** 복사
4. Supabase **Authentication → Providers → Google**:
   - Enable ON
   - Client ID / Client Secret 붙여넣기 → Save

### 4-3. 리다이렉트 URL 등록 (중요)
**Authentication → URL Configuration**:
- **Site URL**: 배포 후 Vercel 도메인 (예: `https://daily-stock.vercel.app`)
- **Redirect URLs** 에 아래 모두 추가:
  ```
  http://localhost:5173
  https://<your-vercel-domain>
  ```
  (로그인 후 이 URL들로만 리다이렉트 허용됨. 없으면 로그인 후 튕김)

---

## 5. 첫 관리자 지정

1. 프론트(로컬 `npm run dev` 또는 배포본)에서 **본인 이메일로 한 번 로그인** → `profiles`에 행이 자동 생성됨(트리거).
   - 이때 `is_approved=false`, `role='user'` 상태 → 아직 리포트 못 봄(정상)
2. Supabase **SQL Editor** 에서 본인을 관리자 + 승인으로 승격:
   ```sql
   update public.profiles
   set role = 'admin', is_approved = true
   where email = 'you@example.com';
   ```
3. 이후 앱의 **/admin** 페이지에서 다른 가입자를 승인/차단할 수 있습니다.

---

## 6. Edge Function 배포 (개인화 재생성용, 선택)

관심 분야 변경 시 즉시 재개인화하는 `personalize` 함수. (없어도 다음 날 파이프라인이 갱신함)

로컬에 **Supabase CLI** 설치 후:
```bash
supabase login
supabase link --project-ref <your-ref>
supabase functions deploy personalize
# 함수 환경변수 설정
supabase secrets set SUPABASE_URL=https://<ref>.supabase.co
supabase secrets set SUPABASE_ANON_KEY=<anon-key>
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

> `SUPABASE_URL` 등 기본 시크릿은 플랫폼이 자동 주입하기도 합니다. 함수 로그에서 누락 시 위 명령으로 보충하세요.

---

## 7. 키를 각 위치에 배치

| 위치 | 변수 | 값 |
|---|---|---|
| `apps/web/.env.local` (로컬) & Vercel 환경변수 | `VITE_SUPABASE_URL` | Project URL |
| | `VITE_SUPABASE_ANON_KEY` | anon key |
| GitHub Secrets (파이프라인) 또는 예약 세션 환경 | `SUPABASE_URL` | Project URL |
| | `SUPABASE_SERVICE_ROLE_KEY` | **service_role key** |

`apps/web/.env.local` 예시:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

---

## 8. 동작 스모크 테스트

1. `npm run dev` → `http://localhost:5173`
2. 이메일/구글로 로그인 → **승인 대기** 화면이 뜨면 인증·트리거 정상
3. 위 5번 SQL로 본인 승인 → 새로고침 → 리포트 화면 진입
4. (아직 리포트 데이터가 없으면 "리포트 없음" 빈 상태가 정상. 파이프라인/디스패치가 첫 리포트를 넣으면 표시됨)

---

## 자주 겪는 문제

| 증상 | 원인 / 해결 |
|---|---|
| 로그인 후 앱으로 안 돌아옴 | **URL Configuration**에 해당 도메인 미등록 → Redirect URLs에 추가 |
| 로그인은 되는데 리포트 403/빈값 | `is_approved=false` → SQL로 승인 |
| `profiles`에 행이 안 생김 | `handle_new_user` 트리거 미생성 → 0001 마이그레이션 재실행 |
| 이미지가 안 보임 | `report-images` 버킷/공개정책 없음 → 0002 마이그레이션 재실행 |
| service_role 키 노출 우려 | 프론트엔 절대 넣지 말 것. anon 키만 프론트에 |

---

준비되면 다음 단계는 **디스패치(예약 Claude 에이전트) 구성 + collect/finalize 분리**입니다.

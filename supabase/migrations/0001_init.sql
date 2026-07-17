-- Daily Stock Report — initial schema, RLS, and triggers.
-- Auth/approval gate: only `is_approved` users can read reports.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  is_approved boolean not null default false,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  sectors text[] not null default '{}',
  tickers text[] not null default '{}',
  topics text[] not null default '{}',
  ai_header boolean not null default false,
  delivery_channels text[] not null default '{web}',
  updated_at timestamptz not null default now()
);

create table if not exists public.raw_items (
  id bigint generated always as identity primary key,
  url text unique not null,
  source text not null,
  title text,
  body text,
  tickers text[],
  published_at timestamptz,
  fetched_at timestamptz not null default now()
);

create table if not exists public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null unique,
  content jsonb not null,
  cover_image_url text,
  card_image_url text,
  status text not null default 'building' check (status in ('building', 'ready', 'failed')),
  pipeline_meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  daily_report_id uuid not null references public.daily_reports (id) on delete cascade,
  report_date date not null,
  content jsonb not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, report_date)
);

create index if not exists idx_daily_reports_date on public.daily_reports (report_date desc);
create index if not exists idx_user_reports_user_date on public.user_reports (user_id, report_date desc);
create index if not exists idx_raw_items_published on public.raw_items (published_at desc);

-- ---------------------------------------------------------------------------
-- New-user trigger: create a profile (unapproved) + empty preferences.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;

  insert into public.preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Helper: is the current user an approved member / admin?
-- ---------------------------------------------------------------------------

create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_approved
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.preferences enable row level security;
alter table public.daily_reports enable row level security;
alter table public.user_reports enable row level security;
alter table public.raw_items enable row level security;

-- profiles: users read/update their own row; admins read all.
create policy "read own profile" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "update own profile" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- preferences: full CRUD on own row only.
create policy "own preferences" on public.preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- daily_reports: readable only by approved users (master, non-personalized).
create policy "approved read daily_reports" on public.daily_reports
  for select using (public.is_approved());

-- user_reports: users read only their own personalized report.
create policy "own user_reports" on public.user_reports
  for select using (user_id = auth.uid());

-- raw_items: internal only. No policy => not selectable by anon/auth roles.
-- (Edge Functions use the service_role key which bypasses RLS.)

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_daily_reports_touch on public.daily_reports;
create trigger trg_daily_reports_touch
  before update on public.daily_reports
  for each row execute function public.touch_updated_at();

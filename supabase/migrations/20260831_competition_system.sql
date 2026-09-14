-- TEA_GAME 社團博覽會競賽系統
-- 在 Supabase SQL Editor 完整執行一次。時間欄位一律存 UTC，前端顯示時轉 Asia/Taipei。

create extension if not exists pgcrypto;

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  start_at timestamptz not null,
  end_at timestamptz not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);

create table if not exists public.admin_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role = 'admin'),
  created_at timestamptz not null default now()
);

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete restrict,
  student_id varchar(20) not null check (student_id ~ '^[[:alnum:] -]+$'),
  player_name varchar(40) not null,
  session_token_hash text not null unique,
  game_started_at timestamptz not null default now(),
  completed_at timestamptz,
  game_duration_seconds integer,
  harvest_summary jsonb not null default '{}'::jsonb,
  quiz_answers jsonb not null default '[]'::jsonb,
  harvest_score integer,
  quiz_score integer,
  total_score integer,
  correct_answers integer,
  is_valid boolean not null default true,
  anomaly_reason text,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (completed_at is null or game_duration_seconds is not null),
  check (total_score is null or total_score between -500 and 2200)
);

create index if not exists game_sessions_activity_rank_idx on public.game_sessions (activity_id, total_score desc, completed_at asc) where is_valid and not is_deleted;
create index if not exists game_sessions_activity_student_idx on public.game_sessions (activity_id, student_id, completed_at desc);
create index if not exists game_sessions_student_name_idx on public.game_sessions (student_id, player_name);
create index if not exists game_sessions_deleted_by_idx on public.game_sessions (deleted_by) where deleted_by is not null;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists activities_set_updated_at on public.activities;
create trigger activities_set_updated_at before update on public.activities
for each row execute function public.set_updated_at();

-- 每個學號每活動只取最高有效分；同分採最早達成時間。
create or replace function public.activity_leaderboard(p_activity_id uuid)
returns table (
  rank bigint,
  student_id varchar,
  player_name varchar,
  high_score integer,
  achieved_at timestamptz,
  play_count bigint
)
language sql stable security definer set search_path = public as $$
  with valid_sessions as (
    select * from public.game_sessions
    where activity_id = p_activity_id and is_valid and not is_deleted and completed_at is not null
  ),
  best as (
    select distinct on (student_id) student_id, player_name, total_score, completed_at
    from valid_sessions
    order by student_id, total_score desc, completed_at asc
  ),
  counts as (
    select student_id, count(*) as play_count from valid_sessions group by student_id
  )
  select dense_rank() over (order by best.total_score desc, best.completed_at asc),
    best.student_id, best.player_name, best.total_score, best.completed_at, counts.play_count
  from best join counts using (student_id)
  order by best.total_score desc, best.completed_at asc;
$$;

-- 前端沒有任何資料表權限。所有玩家寫入與管理員資料都經由 Edge Functions。
alter table public.activities enable row level security;
alter table public.admin_profiles enable row level security;
alter table public.game_sessions enable row level security;

revoke all on public.activities, public.admin_profiles, public.game_sessions from anon, authenticated;
revoke all on function public.activity_leaderboard(uuid) from public, anon, authenticated;
grant execute on function public.activity_leaderboard(uuid) to service_role;

-- Edge Function 以 service_role 執行；沒有 anon/authenticated 的 RLS policy 即為預設拒絕。

-- 建立首位管理員：先於 Authentication > Users 新增 Email/Password 使用者，再執行：
-- insert into public.admin_profiles (id) values ('該使用者的 UUID');

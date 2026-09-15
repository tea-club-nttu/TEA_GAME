-- Global harvest speed settings editable from the authenticated admin dashboard.
create table if not exists public.game_settings (
  id boolean primary key default true check (id),
  config jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.game_settings (id, config)
values (true, '{
  "spawnStartMs": 700,
  "spawnEndMs": 280,
  "speedRampPower": 1.6,
  "types": {
    "twoLeaves": { "weight": 40, "startLifeMs": 2400, "endLifeMs": 900 },
    "singleBud": { "weight": 20, "startLifeMs": 1680, "endLifeMs": 630 },
    "oldLeaf": { "weight": 20, "startLifeMs": 2640, "endLifeMs": 990 },
    "diseasedLeaf": { "weight": 20, "startLifeMs": 2592, "endLifeMs": 972 }
  }
}'::jsonb)
on conflict (id) do nothing;

drop trigger if exists game_settings_set_updated_at on public.game_settings;
create trigger game_settings_set_updated_at before update on public.game_settings
for each row execute function public.set_updated_at();

alter table public.game_settings enable row level security;
revoke all on public.game_settings from anon, authenticated;

alter table public.game_sessions drop constraint game_sessions_total_score_check;
alter table public.game_sessions add constraint game_sessions_total_score_check
  check (total_score is null or total_score between -6000 and 6000);

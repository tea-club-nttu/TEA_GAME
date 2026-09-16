alter table public.activities add column if not exists is_paused boolean not null default false;
alter table public.activities add column if not exists resume_at timestamptz;
comment on column public.activities.is_paused is 'Pause new challenges until resume_at; null resume_at requires manual reopening.';
notify pgrst, 'reload schema';

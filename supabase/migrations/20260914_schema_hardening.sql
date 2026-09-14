-- Align the deployed database with the security and FK-index hardening used by fresh installs.
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create index if not exists game_sessions_deleted_by_idx
  on public.game_sessions (deleted_by)
  where deleted_by is not null;

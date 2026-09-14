-- Expanded range covers valid high and negative scores under balanced harvest scoring.
-- Existing results remain unchanged.
alter table public.game_sessions drop constraint game_sessions_total_score_check;
alter table public.game_sessions add constraint game_sessions_total_score_check
  check (total_score is null or total_score between -3000 and 3200);

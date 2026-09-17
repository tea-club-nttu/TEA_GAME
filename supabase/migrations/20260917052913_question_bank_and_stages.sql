create table public.quiz_questions (
  id text primary key,
  question text not null check (char_length(question) between 1 and 500),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4),
  correct_option_id text not null,
  difficulty text not null check (difficulty in ('easy','medium','hard')),
  is_default boolean not null default false,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.quiz_questions enable row level security;
revoke all on public.quiz_questions from anon, authenticated;
grant select, insert, update, delete on public.quiz_questions to service_role;
create trigger quiz_questions_updated_at before update on public.quiz_questions for each row execute function public.set_updated_at();
alter table public.activities add column stages jsonb not null default '{"harvest":true,"knowledge":true,"quiz":true}'::jsonb;
alter table public.activities add constraint activities_stages_valid check (
  stages ?& array['harvest','knowledge','quiz'] and
  jsonb_typeof(stages->'harvest') = 'boolean' and jsonb_typeof(stages->'knowledge') = 'boolean' and jsonb_typeof(stages->'quiz') = 'boolean' and
  ((stages->>'harvest')::boolean or (stages->>'knowledge')::boolean or (stages->>'quiz')::boolean)
);
alter table public.game_sessions add column stages_snapshot jsonb;
alter table public.game_sessions add column quiz_snapshot jsonb;
alter table public.game_sessions drop constraint game_sessions_total_score_check;
alter table public.game_sessions add constraint game_sessions_total_score_check check (total_score is null or total_score between -6000 and 20000);
insert into public.quiz_questions (id,question,options,correct_option_id,difficulty,is_default,enabled) values
('lunye-oolong','紅烏龍最具代表性的產地是？','[{"id":"chishang","label":"池上"},{"id":"guanshan","label":"關山"},{"id":"luye","label":"鹿野"},{"id":"beinan","label":"卑南"}]'::jsonb,'luye','medium',true,true),
('picking-part','採茶時最適合採摘哪一部分？','[{"id":"one-three","label":"一心三葉"},{"id":"one-two","label":"一心二葉"},{"id":"three-two","label":"三心二葉"},{"id":"oldest","label":"最老的葉片"}]'::jsonb,'one-two','easy',true,true),
('wuhhe-tea','下列哪一種是花蓮具有代表性的茶？','[{"id":"dongding","label":"凍頂烏龍"},{"id":"alishan","label":"阿里山高山茶"},{"id":"wuhhe","label":"舞鶴蜜香紅茶"},{"id":"wenshan","label":"文山包種茶"}]'::jsonb,'wuhhe','medium',true,true),
('brewing-factor','哪一個因素最容易影響泡出的茶風味？','[{"id":"cup-color","label":"杯子的顏色"},{"id":"spoon","label":"茶匙材質"},{"id":"temperature-time","label":"水溫與浸泡時間"},{"id":"tray","label":"茶盤大小"}]'::jsonb,'temperature-time','easy',true,true),
('club-activity','茶道社除了泡茶之外，也會舉辦哪一項活動？','[{"id":"latte","label":"咖啡拉花"},{"id":"flowers","label":"花藝設計"},{"id":"sweets","label":"茶點製作"},{"id":"cocktail","label":"調酒體驗"}]'::jsonb,'sweets','easy',true,true);
notify pgrst, 'reload schema';

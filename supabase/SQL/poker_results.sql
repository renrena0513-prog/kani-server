-- ポーカー大会 結果テーブル
create table if not exists public.poker_results (
  id                          uuid        default gen_random_uuid() primary key,
  match_id                    uuid        not null,
  event_datetime              timestamptz not null default now(),
  discord_user_id             text,
  account_name                text        not null,
  tournament_type             text        not null default '第二回ポーカー大会',
  match_mode                  text        not null default '個人戦',
  team_name                   text,
  player_count                integer     not null default 4,
  rank                        integer     not null,
  final_score                 numeric(10,1) not null default 0,
  rebuy_count                 integer     not null default 0,
  submitted_by_discord_user_id text,
  created_at                  timestamptz default now()
);

-- RLS
alter table public.poker_results enable row level security;

create policy "Anyone can select poker_results"
  on public.poker_results for select using (true);

create policy "Authenticated users can insert poker_results"
  on public.poker_results for insert to authenticated with check (true);

-- インデックス
create index if not exists poker_results_discord_user_id_idx on public.poker_results(discord_user_id);
create index if not exists poker_results_match_id_idx on public.poker_results(match_id);
create index if not exists poker_results_event_datetime_idx on public.poker_results(event_datetime desc);

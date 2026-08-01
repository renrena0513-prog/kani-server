-- 決勝卓予想（優勝チーム予想ベッティング）イベントテーブル
create table if not exists public.poker_finals_predictions (
  id                 uuid        default gen_random_uuid() primary key,
  title              text        not null default '決勝卓予想',
  status             text        not null default 'open', -- open / settled
  teams              jsonb       not null, -- [{ "team_name": "...", "odds": 2.5 }, ...]
  winner_team_name   text,
  created_by         text        not null,
  created_at         timestamptz not null default now(),
  settled_by         text,
  settled_at         timestamptz
);

-- 決勝卓予想 個別ベットテーブル
create table if not exists public.poker_finals_bets (
  id                 uuid        default gen_random_uuid() primary key,
  event_id           uuid        not null references public.poker_finals_predictions(id) on delete cascade,
  discord_user_id    text        not null,
  team_name          text        not null,
  odds               numeric     not null,
  amount             integer     not null,
  payout             integer,    -- null = 未確定、確定後は的中なら amount*odds の四捨五入、外れなら0
  created_at         timestamptz not null default now(),
  unique (event_id, discord_user_id)
);

-- RLS
alter table public.poker_finals_predictions enable row level security;
alter table public.poker_finals_bets enable row level security;

create policy "Anyone can select poker_finals_predictions"
  on public.poker_finals_predictions for select using (true);

create policy "Anyone can select poker_finals_bets"
  on public.poker_finals_bets for select using (true);

-- 書き込みは SECURITY DEFINER の RPC 経由のみ（poker_bet_open_event / poker_bet_place / poker_bet_settle）

-- インデックス
create index if not exists poker_finals_bets_event_id_idx on public.poker_finals_bets(event_id);
create index if not exists poker_finals_bets_discord_user_id_idx on public.poker_finals_bets(discord_user_id);
create index if not exists poker_finals_predictions_status_idx on public.poker_finals_predictions(status);

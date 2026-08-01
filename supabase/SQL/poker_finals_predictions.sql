-- 決勝卓予想（優勝チーム予想ベッティング）イベントテーブル
create table if not exists public.poker_finals_predictions (
  id                 uuid        default gen_random_uuid() primary key,
  title              text        not null default '決勝卓予想',
  status             text        not null default 'open', -- open / settled / cancelled
  teams              jsonb       not null, -- 単勝オッズ入力 [{ "team_name": "...", "odds": 2.5 }, ...]
  trio_odds          jsonb,      -- 三連複オッズ（自動生成）[{ "teams": ["A","B","C"] (昇順), "odds": 12.3 }, ...]
  trifecta_odds      jsonb,      -- 三連単オッズ（自動生成）[{ "teams": ["A","B","C"] (着順), "odds": 45.6 }, ...]
  place_odds         jsonb,      -- 複勝オッズ（自動生成）[{ "team_name": "...", "odds": 3.2 }, ...]（3着以内で的中）
  result_order       jsonb,      -- 確定結果 [1位, 2位, 3位]
  winner_team_name   text,       -- = result_order[0]（表示用に複製）
  created_by         text        not null,
  created_at         timestamptz not null default now(),
  payout_rate        numeric,    -- 開催時点の設定スナップショット
  min_odds           numeric,
  max_odds           numeric,
  settled_by         text,
  settled_at         timestamptz
);

-- 決勝卓予想 個別ベットテーブル（プレイヤーは複数回ベット可能）
create table if not exists public.poker_finals_bets (
  id                 uuid        default gen_random_uuid() primary key,
  event_id           uuid        not null references public.poker_finals_predictions(id) on delete cascade,
  discord_user_id    text        not null,
  bet_type           text        not null, -- win / place / trio / trifecta
  selection          jsonb       not null, -- チーム名の配列（trifectaのみ順序に意味あり）
  odds               numeric     not null,
  amount             integer     not null,
  payout             integer,    -- null = 未確定、確定後は的中なら amount*odds の四捨五入、外れなら0
  created_at         timestamptz not null default now()
);

-- 決勝卓予想 全体設定（払戻率・オッズ上下限、シングルトン行）
create table if not exists public.poker_betting_settings (
  id           int         primary key default 1,
  payout_rate  numeric     not null default 0.8,
  min_odds     numeric     not null default 1.1,
  max_odds     numeric     not null default 999,
  updated_at   timestamptz default now(),
  updated_by   text,
  constraint poker_betting_settings_singleton check (id = 1)
);
insert into public.poker_betting_settings (id) values (1) on conflict (id) do nothing;

-- RLS
alter table public.poker_finals_predictions enable row level security;
alter table public.poker_finals_bets enable row level security;
alter table public.poker_betting_settings enable row level security;

create policy "Anyone can select poker_finals_predictions"
  on public.poker_finals_predictions for select using (true);

create policy "Anyone can select poker_finals_bets"
  on public.poker_finals_bets for select using (true);

create policy "Admins can select poker_betting_settings"
  on public.poker_betting_settings for select using (is_admin());

-- 書き込みは SECURITY DEFINER の RPC 経由のみ
-- （poker_bet_open_event / poker_bet_place / poker_bet_settle / poker_bet_update_settings）

-- インデックス
create index if not exists poker_finals_bets_event_id_idx on public.poker_finals_bets(event_id);
create index if not exists poker_finals_bets_discord_user_id_idx on public.poker_finals_bets(discord_user_id);
create index if not exists poker_finals_predictions_status_idx on public.poker_finals_predictions(status);

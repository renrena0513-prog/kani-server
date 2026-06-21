-- ポーカー専用チームテーブル
create table if not exists public.poker_teams (
  id                  uuid    default gen_random_uuid() primary key,
  team_name           text    not null unique,
  creator_discord_id  text    not null,
  created_at          timestamptz default now()
);

-- ポーカー専用チーム加入申請テーブル
create table if not exists public.poker_team_join_requests (
  id                uuid    default gen_random_uuid() primary key,
  team_id           uuid    not null references public.poker_teams(id) on delete cascade,
  discord_user_id   text    not null,
  status            text    not null default 'pending',
  -- status: pending / approved / rejected / leave_pending / left
  created_at        timestamptz default now()
);

-- ポーカープロフィール（チーム所属情報）
create table if not exists public.poker_profiles (
  discord_user_id   text    primary key,
  team_id           uuid    references public.poker_teams(id) on delete set null,
  team_name         text,
  updated_at        timestamptz default now()
);

-- RLS
alter table public.poker_teams enable row level security;
alter table public.poker_team_join_requests enable row level security;
alter table public.poker_profiles enable row level security;

create policy "Anyone can select poker_teams"
  on public.poker_teams for select using (true);
create policy "Authenticated users can insert poker_teams"
  on public.poker_teams for insert to authenticated with check (true);
create policy "Authenticated users can update poker_teams"
  on public.poker_teams for update to authenticated using (true);
create policy "Authenticated users can delete poker_teams"
  on public.poker_teams for delete to authenticated using (true);

create policy "Anyone can select poker_team_join_requests"
  on public.poker_team_join_requests for select using (true);
create policy "Authenticated users can insert poker_team_join_requests"
  on public.poker_team_join_requests for insert to authenticated with check (true);
create policy "Authenticated users can update poker_team_join_requests"
  on public.poker_team_join_requests for update to authenticated using (true);
create policy "Authenticated users can delete poker_team_join_requests"
  on public.poker_team_join_requests for delete to authenticated using (true);

create policy "Anyone can select poker_profiles"
  on public.poker_profiles for select using (true);
create policy "Authenticated users can insert poker_profiles"
  on public.poker_profiles for insert to authenticated with check (true);
create policy "Authenticated users can update poker_profiles"
  on public.poker_profiles for update to authenticated using (true);

-- インデックス
create index if not exists poker_team_join_requests_team_id_idx on public.poker_team_join_requests(team_id);
create index if not exists poker_team_join_requests_discord_user_id_idx on public.poker_team_join_requests(discord_user_id);
create index if not exists poker_profiles_team_id_idx on public.poker_profiles(team_id);

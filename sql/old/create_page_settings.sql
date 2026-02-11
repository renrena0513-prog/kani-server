-- ページアクセス制御用の設定テーブル
create table if not exists public.page_settings (
  id uuid default gen_random_uuid() primary key,
  path text not null unique,
  name text not null,
  is_active boolean default true,
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  updated_by text
);

-- RLS (Row Level Security) の設定
alter table public.page_settings enable row level security;

-- 参照は誰でも可能（アクセスコントロールのため）
create policy "Allow read access for all users"
  on public.page_settings for select
  using (true);

-- 更新は管理者のみ（あるいは特定のユーザー）
-- ここでは簡易的に全ユーザー許可とし、クライアント側で出し分け、または別途ポリシー設定
-- ※ 本番運用では管理者のみに絞るべきです
create policy "Allow update for authenticated users"
  on public.page_settings for update
  using (auth.role() = 'authenticated');

-- 初期データの投入
insert into public.page_settings (path, name, is_active)
values
  ('/mahjong/', '麻雀大会機能', true),
  ('/mypage/', 'マイページ', true),
  ('/badge/', 'バッジシステム', true),
  ('/ranking/', '資産ランキング', true),
  ('/omikuji/', 'おみくじ/お賽銭', true),
  ('/poker/', 'ポーカー', true)
on conflict (path) do nothing;

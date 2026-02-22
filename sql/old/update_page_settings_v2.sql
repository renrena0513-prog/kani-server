-- 既存の広範な設定を削除（一旦すべてクリア）
truncate table public.page_settings;

-- 新しい個別ページ単位の設定を投入
insert into public.page_settings (path, name, is_active)
values
  ('/badge/shop.html', 'バッジショップ', true),
  ('/omikuji/osaisen.html', 'お賽銭', true),
  ('/omikuji/index.html', 'おみくじ', true),
  ('/mahjong/record.html', '対局記録入力', true),
  ('/event/drill.html', '期間限定イベント：ほりほりドリル', true),
  ('/event/slot.html', '期間限定イベント：スロット', false)
on conflict (path) do update 
set name = excluded.name;

-- 確認用
select * from public.page_settings order by path;

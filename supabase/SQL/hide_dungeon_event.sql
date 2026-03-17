-- 欲望渦巻くダンジョンをページ管理で非表示化
update public.page_settings
   set is_active = false,
       updated_at = now()
 where path in ('/event/dungeon', '/event/dungeon/', '/event/dungeon/index.html');

insert into public.page_settings (path, name, is_active, updated_at)
values
    ('/event/dungeon/index.html', '期間限定イベント：欲望渦巻くダンジョン', false, now())
on conflict (path) do update
set is_active = excluded.is_active,
    updated_at = excluded.updated_at;

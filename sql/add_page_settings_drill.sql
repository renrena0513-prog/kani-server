-- Add drill page to page_settings for ON/OFF control
insert into public.page_settings (path, name, is_active)
values ('/event/drill.html', '期間限定イベント：ほりほりドリル', false)
on conflict (path) do update
set name = excluded.name;

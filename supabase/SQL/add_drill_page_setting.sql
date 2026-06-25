-- ほりほりドリルをページ管理に追加（非公開状態で登録）
INSERT INTO public.page_settings (path, name, is_active, updated_at)
VALUES ('/drill', 'ほりほりドリル', false, now())
ON CONFLICT (path) DO NOTHING;

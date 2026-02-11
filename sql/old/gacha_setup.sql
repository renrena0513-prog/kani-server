-- ガチャ設定テーブル
CREATE TABLE IF NOT EXISTS public.gacha_configs (
    gacha_type text PRIMARY KEY,
    allowed_payment_types text[] NOT NULL DEFAULT '{}'::text[],
    coin_price integer
);

-- 初期設定（必要に応じて更新）
INSERT INTO public.gacha_configs (gacha_type, allowed_payment_types, coin_price)
VALUES
    ('妖怪', ARRAY['gacha_ticket','mangan_ticket'], NULL),
    ('じゃれ本', ARRAY['coin'], 50)
ON CONFLICT (gacha_type) DO UPDATE SET
    allowed_payment_types = EXCLUDED.allowed_payment_types,
    coin_price = EXCLUDED.coin_price;

-- is_gacha_eligible を TEXT 化 (既存値は一旦すべて NULL に統一)
ALTER TABLE public.badges
    ALTER COLUMN is_gacha_eligible TYPE text USING (CASE WHEN is_gacha_eligible IS NULL THEN NULL ELSE is_gacha_eligible::text END);

UPDATE public.badges SET is_gacha_eligible = NULL;

-- gacha_weight 追加
ALTER TABLE public.badges ADD COLUMN IF NOT EXISTS gacha_weight numeric;
UPDATE public.badges SET gacha_weight = 1 WHERE gacha_weight IS NULL;
ALTER TABLE public.badges ALTER COLUMN gacha_weight SET DEFAULT 1;

-- 旧RPCは不要なので削除
DROP FUNCTION IF EXISTS public.draw_gacha(text, text);
DROP FUNCTION IF EXISTS public.draw_gacha_multi(text, integer);

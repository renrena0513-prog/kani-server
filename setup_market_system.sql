-- 1. profiles テーブル拡張
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_assets BigInt DEFAULT 0;

-- 2. badges テーブル拡張
ALTER TABLE badges ADD COLUMN IF NOT EXISTS price Int DEFAULT 1000;
ALTER TABLE badges ADD COLUMN IF NOT EXISTS discord_user_id Text;
ALTER TABLE badges ADD COLUMN IF NOT EXISTS is_fixed_price Boolean DEFAULT False;
ALTER TABLE badges ADD COLUMN IF NOT EXISTS fixed_rarity_name Text;

-- 3. rarity_thresholds テーブル新設
CREATE TABLE IF NOT EXISTS rarity_thresholds (
    id Serial PRIMARY KEY,
    threshold_value Int NOT NULL,
    rarity_name Text NOT NULL,
    created_at Timestamptz DEFAULT Now()
);

-- シードデータ投入（10段階）
INSERT INTO rarity_thresholds (threshold_value, rarity_name) VALUES
(0, 'Common'),
(2000, 'Uncommon'),
(5000, 'Rare'),
(12000, 'Epic'),
(30000, 'Legendary'),
(75000, 'Mythic'),
(180000, 'Divine'),
(450000, 'Celestial'),
(1000000, 'Eternal'),
(3000000, 'Cosmic')
ON CONFLICT DO NOTHING;

-- 既存データの移行 (古い user_badges から引き継ぎ)
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='badges' AND column_name='order') THEN
        ALTER TABLE badges RENAME COLUMN "order" TO sort_order;
    END IF;
END $$;

INSERT INTO user_badges_new (user_id, badge_id, purchased_price)
SELECT user_id, badge_id, 0 
FROM user_badges
ON CONFLICT DO NOTHING; -- すでにある場合はスキップ

-- 5. 経済ロジック RPC 関数の定義

-- 市場流通枚数の計算
CREATE OR REPLACE FUNCTION get_badge_market_count(p_badge_id UUID)
RETURNS Int AS $$
BEGIN
    RETURN (SELECT Count(*) FROM user_badges_new WHERE badge_id = p_badge_id);
END;
$$ LANGUAGE plpgsql;

-- 価格算出ロジック (Buy Price)
CREATE OR REPLACE FUNCTION calculate_badge_buy_price(p_base_price Int, n Int)
RETURNS Int AS $$
BEGIN
    RETURN Ceil(p_base_price * Power(1.3, n));
END;
$$ LANGUAGE plpgsql;

-- 購入処理 RPC
CREATE OR REPLACE FUNCTION purchase_badge_v2(p_user_id Text, p_badge_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_base_price Int;
    v_n Int;
    v_buy_price Int;
    v_creator_id Text;
    v_is_fixed Boolean;
    v_user_coins Int;
    v_is_mutant Boolean;
    v_share_rate Float;
    v_share_amount Int;
BEGIN
    -- バッジ情報取得
    SELECT price, is_fixed_price, discord_user_id INTO v_base_price, v_is_fixed, v_creator_id
    FROM badges WHERE id = p_badge_id;
    
    -- 流通枚数 $n$
    SELECT Count(*) INTO v_n FROM user_badges_new WHERE badge_id = p_badge_id;
    
    -- 価格決定
    IF v_is_fixed THEN
        v_buy_price := v_base_price;
    ELSE
        v_buy_price := Ceil(v_base_price * Power(1.3, v_n));
    END IF;
    
    -- 資金チェック
    SELECT coins INTO v_user_coins FROM profiles WHERE discord_user_id = p_user_id;
    IF v_user_coins < v_buy_price THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Insufficient coins');
    END IF;
    
    -- ミュータント抽選 (3%)
    v_is_mutant := Random() < 0.03;
    
    -- トランザクション
    -- 1. 購入者のコイン減算
    UPDATE profiles SET coins = coins - v_buy_price WHERE discord_user_id = p_user_id;
    
    -- 2. バッジ付与
    INSERT INTO user_badges_new (user_id, badge_id, purchased_price, is_mutant)
    VALUES (p_user_id, p_badge_id, v_buy_price, v_is_mutant);
    
    -- 3. クリエイター還元
    IF v_creator_id IS NOT NULL AND v_creator_id != p_user_id THEN
        v_share_rate := CASE WHEN v_is_fixed THEN 0.2 ELSE 0.05 END;
        v_share_amount := Ceil(v_buy_price * v_share_rate);
        UPDATE profiles 
        SET coins = coins + v_share_amount, 
            total_assets = total_assets + v_share_amount 
        WHERE discord_user_id = v_creator_id;
    END IF;
    
    RETURN jsonb_build_object('ok', true, 'buy_price', v_buy_price, 'is_mutant', v_is_mutant);
END;
$$ LANGUAGE plpgsql;

-- 売却処理 RPC
CREATE OR REPLACE FUNCTION sell_badge_v2(p_user_id Text, p_badge_uuid UUID)
RETURNS JSONB AS $$
DECLARE
    v_badge_id UUID;
    v_purchased_price Int;
    v_is_mutant Boolean;
    v_is_fixed Boolean;
    v_base_price Int;
    v_n Int;
    v_asset_value Int;
    v_sell_price Int;
BEGIN
    -- 個体情報取得
    SELECT badge_id, purchased_price, is_mutant INTO v_badge_id, v_purchased_price, v_is_mutant
    FROM user_badges_new WHERE uuid = p_badge_uuid AND user_id = p_user_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Badge not found or unauthorized');
    END IF;
    
    -- バッジマスター情報
    SELECT price, is_fixed_price INTO v_base_price, v_is_fixed FROM badges WHERE id = v_badge_id;
    
    -- 全流通枚数 $n$
    SELECT Count(*) INTO v_n FROM user_badges_new WHERE badge_id = v_badge_id;
    
    -- 資産価値 P_value = price * 1.3^(n-1)
    IF v_is_fixed THEN
        v_asset_value := v_base_price;
    ELSE
        v_asset_value := Ceil(v_base_price * Power(1.3, v_n - 1));
    END IF;
    
    -- 売却価格
    v_sell_price := Ceil(v_asset_value * 0.7 * (CASE WHEN v_is_mutant THEN 3 ELSE 1 END));
    
    -- トランザクション
    -- 1. コイン加算・累計収入反映
    UPDATE profiles 
    SET coins = coins + v_sell_price, 
        total_assets = total_assets + (CASE WHEN v_sell_price > v_purchased_price THEN v_sell_price - v_purchased_price ELSE 0 END)
    WHERE discord_user_id = p_user_id;
    
    -- 2. バッジ削除
    DELETE FROM user_badges_new WHERE uuid = p_badge_uuid;
    
    RETURN jsonb_build_object('ok', true, 'sell_price', v_sell_price);
END;
$$ LANGUAGE plpgsql;

-- 6. 追加の不具合修正

-- activity_logs に match_id カラムがない場合に追加
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS match_id Text;

-- user_badges_new と profiles のリレーション（外部キー）を強制設定
-- これがないと、バッジ詳細画面などで profiles を結合 (Join) するときにエラーになります。
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'user_badges_new_user_id_fkey') THEN
        ALTER TABLE user_badges_new 
        ADD CONSTRAINT user_badges_new_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES profiles(discord_user_id) 
        ON DELETE CASCADE;
    END IF;
END $$;

-- コイン送金 RPC (引数の順番を JS 側と一致させる: p_amount を先頭に)
CREATE OR REPLACE FUNCTION transfer_coins(p_amount Int, p_from_id Text, p_to_id Text)
RETURNS JSONB AS $$
DECLARE
    v_from_coins Int;
BEGIN
    -- 1. 送り主の残高チェック
    SELECT coins INTO v_from_coins FROM profiles WHERE discord_user_id = p_from_id;
    IF v_from_coins < p_amount THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Insufficient coins');
    END IF;

    -- 2. トランザクション
    UPDATE profiles SET coins = coins - p_amount WHERE discord_user_id = p_from_id;
    UPDATE profiles SET coins = coins + p_amount, total_assets = total_assets + p_amount WHERE discord_user_id = p_to_id;

    RETURN jsonb_build_object('ok', true);
END;
$$ LANGUAGE plpgsql;

-- 売却機能 (sell_badge_v2) の更新
-- 資産価値ランクの2段階下の価格で売却するロジック
-- ミュータントは3倍

CREATE OR REPLACE FUNCTION public.sell_badge_v2(p_user_id text, p_badge_uuid uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_badge_id uuid;
    v_badge RECORD;
    v_user_badge RECORD;
    v_circulation_count INTEGER;
    v_base_star INTEGER;
    v_asset_star INTEGER;
    v_sell_star INTEGER;
    v_sell_price INTEGER;
    v_target_user_id TEXT;
BEGIN
    -- ユーザーID正規化
    IF p_user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        SELECT discord_user_id INTO v_target_user_id FROM public.profiles WHERE id = p_user_id::uuid;
        IF NOT FOUND THEN
             -- 見つからない場合はそのまま使う（互換性）
             v_target_user_id := p_user_id;
        END IF;
    ELSE
        v_target_user_id := p_user_id;
    END IF;

    -- 所有チェック
    SELECT * INTO v_user_badge FROM public.user_badges_new 
    WHERE uuid = p_badge_uuid AND user_id = v_target_user_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object('ok', false, 'error', 'バッジを所持していません');
    END IF;
    
    v_badge_id := v_user_badge.badge_id;
    
    -- バッジ情報取得
    SELECT * INTO v_badge FROM public.badges WHERE id = v_badge_id;
    
    -- 価格計算
    IF v_badge.sales_type = '換金品' THEN
        v_sell_price := v_badge.price;
    ELSE
        -- 1. 基本ランク(v_base_star)の計算
        IF v_badge.fixed_rarity_name IS NOT NULL THEN
            -- 固定レアリティの場合、そのランク（行番号）を取得
            WITH ordered_t AS (
                SELECT rarity_name, ROW_NUMBER() OVER (ORDER BY threshold_value) as rn
                FROM public.rarity_thresholds
            )
            SELECT rn INTO v_base_star FROM ordered_t WHERE rarity_name = v_badge.fixed_rarity_name;
            IF v_base_star IS NULL THEN v_base_star := 1; END IF;
        ELSE
            -- 価格からランク計算
            SELECT count(*) INTO v_base_star FROM public.rarity_thresholds WHERE threshold_value <= v_badge.price;
            IF v_base_star = 0 THEN v_base_star := 1; END IF;
        END IF;
        
        -- 2. 資産価値ランク(v_asset_star)の計算
        IF v_badge.sales_type = '変動型' THEN
            SELECT count(*) INTO v_circulation_count FROM public.user_badges_new WHERE badge_id = v_badge_id;
            -- 資産価値は現在の流通数(n)に基づく: base + (n-1)
            v_asset_star := LEAST(v_base_star + GREATEST(0, v_circulation_count - 1), 46);
        ELSE
            -- 固定型
            v_asset_star := v_base_star;
        END IF;
        
        -- 3. 売却ランク(v_sell_star)の計算: 2段階下 (最低1)
        v_sell_star := GREATEST(v_asset_star - 2, 1);
        
        -- 4. 売却価格の取得
        SELECT threshold_value INTO v_sell_price 
        FROM public.rarity_thresholds 
        ORDER BY threshold_value ASC 
        LIMIT 1 OFFSET (v_sell_star - 1);
        
        IF v_sell_price IS NULL THEN v_sell_price := 50; END IF;
    END IF;
    
    -- ミュータント補正
    IF v_user_badge.is_mutant THEN
        v_sell_price := v_sell_price * 3;
    END IF;

    -- 売却実行
    UPDATE public.profiles SET coins = coins + v_sell_price WHERE discord_user_id = v_target_user_id;
    DELETE FROM public.user_badges_new WHERE uuid = p_badge_uuid;
    
    RETURN json_build_object('ok', true, 'sell_price', v_sell_price);

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'error', SQLERRM);
END;
$function$;

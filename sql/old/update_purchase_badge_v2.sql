-- 新レアリティシステムに対応した購入関数 (purchase_badge_v2) の更新
-- 重複エラー回避のため、すべてのシグネチャの既存関数を削除
DROP FUNCTION IF EXISTS public.purchase_badge_v2(text, uuid);
DROP FUNCTION IF EXISTS public.purchase_badge_v2(text, bigint);
DROP FUNCTION IF EXISTS public.purchase_badge_v2(text, text);

CREATE OR REPLACE FUNCTION public.purchase_badge_v2(p_user_id text, p_badge_id text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_badge_id UUID; -- バッジIDはUUID
    v_badge RECORD;
    v_profile RECORD;
    v_circulation_count INTEGER;
    v_price INTEGER;
    v_base_star INTEGER;
    v_final_star INTEGER;
    v_rarity_name TEXT;
    v_thresholds RECORD;
    v_is_mutant BOOLEAN;
    v_uuid UUID;
    v_target_user_id TEXT;
BEGIN
    -- バッジIDのUUID変換
    BEGIN
        v_badge_id := p_badge_id::uuid;
    EXCEPTION WHEN OTHERS THEN
        RETURN json_build_object('ok', false, 'error', '無効なバッジID形式です(UUIDが必要です): ' || p_badge_id);
    END;

    -- user_id の正規化 (UUIDが渡された場合は profiles.id から discord_user_id を取得)
    IF p_user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        SELECT discord_user_id INTO v_target_user_id FROM public.profiles WHERE id = p_user_id::uuid;
        IF NOT FOUND THEN
             RETURN json_build_object('ok', false, 'error', '指定されたUUIDのユーザーが見つかりません');
        END IF;
    ELSE
        v_target_user_id := p_user_id;
    END IF;

    -- 1. バッジ情報の取得
    SELECT * INTO v_badge FROM public.badges WHERE id = v_badge_id;
    IF NOT FOUND THEN
        RETURN json_build_object('ok', false, 'error', 'バッジが見つかりません');
    END IF;

    -- 在庫チェック
    IF v_badge.remaining_count IS NOT NULL AND v_badge.remaining_count <= 0 THEN
        RETURN json_build_object('ok', false, 'error', '売り切れです');
    END IF;

    -- 2. ユーザー情報の取得
    SELECT * INTO v_profile FROM public.profiles WHERE discord_user_id = v_target_user_id;
    IF NOT FOUND THEN
        RETURN json_build_object('ok', false, 'error', 'ユーザープロファイルが見つかりません');
    END IF;

    -- 3. 価格計算 (新ロジック)
    
    -- 現在の流通数をカウント (所有レコード数)
    SELECT count(*) INTO v_circulation_count FROM public.user_badges_new WHERE badge_id = v_badge_id;

    -- 3-1. 基本ランクの決定
    IF v_badge.fixed_rarity_name IS NOT NULL THEN
        SELECT threshold_value INTO v_price FROM public.rarity_thresholds WHERE rarity_name = v_badge.fixed_rarity_name;
        IF v_price IS NULL THEN v_price := v_badge.price; END IF;
    ELSIF v_badge.sales_type <> '変動型' THEN
        v_price := v_badge.price;
    ELSE
        SELECT count(*) INTO v_base_star 
        FROM public.rarity_thresholds 
        WHERE threshold_value <= v_badge.price;
        
        IF v_base_star = 0 THEN v_base_star := 1; END IF;
        
        -- 2. 最終ランクの計算
        -- 購入価格は「購入後の流通数(n+1)」に基づくランク(base + n)で計算
        -- 現在の流通数 v_circulation_count をそのまま足せば良い
        v_final_star := LEAST(v_base_star + v_circulation_count, 46);
        
        -- 3. 最終ランクに対応する価格を取得
        SELECT threshold_value, rarity_name INTO v_price, v_rarity_name
        FROM public.rarity_thresholds
        ORDER BY threshold_value ASC
        LIMIT 1 OFFSET (v_final_star - 1);
        
        IF v_price IS NULL THEN v_price := 50; END IF;
    END IF;

    -- 4. 残高チェック
    IF v_profile.coins < v_price THEN
        RETURN json_build_object('ok', false, 'error', 'コインが不足しています (必要: ' || v_price || 'C)');
    END IF;

    -- 5. 購入処理
    -- コイン減算
    UPDATE public.profiles SET coins = coins - v_price WHERE discord_user_id = v_target_user_id;
    
    -- バッジ在庫減算
    IF v_badge.remaining_count IS NOT NULL THEN
        UPDATE public.badges SET remaining_count = remaining_count - 1 WHERE id = v_badge_id;
    END IF;

    -- ミュータント判定
    v_is_mutant := (random() < 0.05);

    -- バッジ付与
    INSERT INTO public.user_badges_new (user_id, badge_id, acquired_at, is_mutant, purchased_price)
    VALUES (v_target_user_id, v_badge_id, now(), v_is_mutant, v_price)
    RETURNING uuid INTO v_uuid;

    RETURN json_build_object(
        'ok', true,
        'uuid', v_uuid,
        'price', v_price,
        'is_mutant', v_is_mutant,
        'rarity', v_rarity_name
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'error', SQLERRM);
END;
$function$;

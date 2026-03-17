CREATE OR REPLACE FUNCTION public.draw_gacha_v2(p_user_id text, p_gacha_type text, p_payment_type text, p_count integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_target_user_id text;
    v_profile record;
    v_count integer;
    v_pool_count integer;
    v_coin_price integer;
    v_total_cost integer;
    v_results jsonb := '[]'::jsonb;
    v_draw integer;
    v_badge record;
    v_uuid uuid;
    v_is_mutant boolean;
    v_rarity_name text;
    v_base_star integer;
    v_circulation_count integer;
    v_allowed_payments text[];
    v_config_coin_price integer;
BEGIN
    v_target_user_id := p_user_id;

    IF p_user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        SELECT discord_user_id INTO v_target_user_id
        FROM public.profiles
        WHERE id = p_user_id::uuid;
        IF v_target_user_id IS NULL THEN
            RETURN json_build_object('ok', false, 'error', '指定されたUUIDのユーザーが見つかりません');
        END IF;
    END IF;

    v_count := COALESCE(p_count, 1);
    IF v_count < 1 THEN v_count := 1; END IF;
    IF v_count > 10 THEN v_count := 10; END IF;

    IF p_gacha_type IS NULL OR p_gacha_type = '' THEN
        RETURN json_build_object('ok', false, 'error', 'ガチャ種別が指定されていません');
    END IF;

    IF p_payment_type NOT IN ('coin', 'gacha_ticket', 'mangan_ticket') THEN
        RETURN json_build_object('ok', false, 'error', '支払い方法が不正です');
    END IF;

    SELECT allowed_payment_types, coin_price
      INTO v_allowed_payments, v_config_coin_price
    FROM public.gacha_configs
    WHERE gacha_type = p_gacha_type;

    IF v_allowed_payments IS NULL THEN
        RETURN json_build_object('ok', false, 'error', 'ガチャ種別が未設定です');
    END IF;

    IF NOT (p_payment_type = ANY(v_allowed_payments)) THEN
        RETURN json_build_object('ok', false, 'error', '指定ガチャではその支払い方法は利用できません');
    END IF;

    SELECT * INTO v_profile
    FROM public.profiles
    WHERE discord_user_id = v_target_user_id;
    IF NOT FOUND THEN
        RETURN json_build_object('ok', false, 'error', 'ユーザープロファイルが見つかりません');
    END IF;

    SELECT count(*) INTO v_pool_count
    FROM public.badges
    WHERE is_gacha_eligible = p_gacha_type
      AND (p_payment_type <> 'mangan_ticket' OR sales_type <> '換金品');

    IF v_pool_count = 0 THEN
        RETURN json_build_object('ok', false, 'error', '排出対象のバッジがありません');
    END IF;

    IF p_payment_type = 'coin' THEN
        IF v_config_coin_price IS NULL OR v_config_coin_price < 1 THEN
            RETURN json_build_object('ok', false, 'error', 'コイン価格が未設定です');
        END IF;
        v_coin_price := v_config_coin_price;
        v_total_cost := v_coin_price * v_count;

        IF v_profile.coins < v_total_cost THEN
            RETURN json_build_object('ok', false, 'error', 'コインが不足しています (必要: ' || v_total_cost || 'C)');
        END IF;

        UPDATE public.profiles
        SET coins = coins - v_total_cost
        WHERE discord_user_id = v_target_user_id;

    ELSIF p_payment_type = 'gacha_ticket' THEN
        IF COALESCE(v_profile.gacha_tickets, 0) < v_count THEN
            RETURN json_build_object('ok', false, 'error', '祈願符が不足しています (必要: ' || v_count || '枚)');
        END IF;
        UPDATE public.profiles
        SET gacha_tickets = COALESCE(gacha_tickets, 0) - v_count
        WHERE discord_user_id = v_target_user_id;

    ELSIF p_payment_type = 'mangan_ticket' THEN
        IF COALESCE(v_profile.mangan_tickets, 0) < v_count THEN
            RETURN json_build_object('ok', false, 'error', '満願符が不足しています (必要: ' || v_count || '枚)');
        END IF;
        UPDATE public.profiles
        SET mangan_tickets = COALESCE(mangan_tickets, 0) - v_count
        WHERE discord_user_id = v_target_user_id;
    END IF;

    FOR v_draw IN 1..v_count LOOP
        WITH pool AS (
            SELECT id, name, image_url, price, fixed_rarity_name, sales_type,
                   COALESCE(gacha_weight, 1) AS weight
            FROM public.badges
            WHERE is_gacha_eligible = p_gacha_type
              AND (p_payment_type <> 'mangan_ticket' OR sales_type <> '換金品')
              AND COALESCE(gacha_weight, 1) > 0
        ), totals AS (
            SELECT SUM(weight) AS total_weight
            FROM pool
        ), pick AS (
            SELECT random() * total_weight AS threshold
            FROM totals
        ), weights AS (
            SELECT p.*,
                   t.total_weight,
                   SUM(weight) OVER (ORDER BY id) AS running_weight
            FROM pool p
            CROSS JOIN totals t
        )
        SELECT * INTO v_badge
        FROM weights
        CROSS JOIN pick
        WHERE total_weight > 0
          AND running_weight >= pick.threshold
        ORDER BY running_weight
        LIMIT 1;

        IF NOT FOUND THEN
            RETURN json_build_object('ok', false, 'error', 'ガチャ抽選に失敗しました');
        END IF;

        IF v_badge.fixed_rarity_name IS NOT NULL THEN
            v_rarity_name := v_badge.fixed_rarity_name;
        ELSE
            SELECT count(*) INTO v_base_star
            FROM public.rarity_thresholds
            WHERE threshold_value <= v_badge.price;
            IF v_base_star IS NULL OR v_base_star = 0 THEN v_base_star := 1; END IF;

            IF v_badge.sales_type = '変動型' THEN
                SELECT count(*) INTO v_circulation_count
                FROM public.user_badges_new
                WHERE badge_id = v_badge.id;
                v_base_star := LEAST(v_base_star + GREATEST(v_circulation_count - 1, 0), 46);
            END IF;

            SELECT rarity_name INTO v_rarity_name
            FROM public.rarity_thresholds
            ORDER BY threshold_value ASC
            LIMIT 1 OFFSET (v_base_star - 1);
        END IF;

        v_is_mutant := (random() < 0.03);

        INSERT INTO public.user_badges_new (user_id, badge_id, acquired_at, is_mutant, purchased_price)
        VALUES (
            v_target_user_id,
            v_badge.id,
            now(),
            v_is_mutant,
            CASE WHEN p_payment_type = 'coin' THEN v_coin_price ELSE 0 END
        )
        RETURNING uuid INTO v_uuid;

        v_results := v_results || jsonb_build_array(
            jsonb_build_object(
                'uuid', v_uuid,
                'badge_id', v_badge.id,
                'name', v_badge.name,
                'image_url', v_badge.image_url,
                'rarity', v_rarity_name,
                'is_mutant', v_is_mutant
            )
        );
    END LOOP;

    RETURN json_build_object(
        'ok', true,
        'results', v_results,
        'coin_cost', COALESCE(v_total_cost, 0)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'error', SQLERRM);
END;
$function$;

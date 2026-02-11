CREATE OR REPLACE FUNCTION public.repair_drill(target_user_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_global_depth INT;
    v_luck_level INT;
    v_cost INT;
    v_user_coins INT;
BEGIN
    -- 現在のレベルを計算
    SELECT COALESCE(SUM(total_taps), 0) INTO v_global_depth FROM event_drill_user_stats;
    v_luck_level := LEAST(floor(v_global_depth / 1000)::INT, 10);
    
    -- 修理費用を計算: 100 + (レベル * 20) -> 最大 300
    v_cost := 100 + (v_luck_level * 20);

    SELECT coins INTO v_user_coins FROM profiles WHERE discord_user_id = target_user_id;
    IF v_user_coins < v_cost THEN 
        RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_COINS', 'cost', v_cost); 
    END IF;

    UPDATE profiles SET coins = coins - v_cost WHERE discord_user_id = target_user_id;
    UPDATE event_drill_user_stats SET daily_taps = 0 WHERE user_id = target_user_id;
    
    RETURN jsonb_build_object(
        'success', true, 
        'new_coins', v_user_coins - v_cost,
        'cost', v_cost
    );
END;
$function$;

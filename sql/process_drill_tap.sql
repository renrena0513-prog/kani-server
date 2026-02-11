CREATE OR REPLACE FUNCTION public.process_drill_tap(target_user_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_daily_limit CONSTANT INT := 100;
    v_stats RECORD;
    v_now TIMESTAMP WITH TIME ZONE := NOW();
    v_today_jst DATE := (v_now AT TIME ZONE 'Asia/Tokyo')::DATE;
    v_last_tap_jst DATE;
    v_global_depth BIGINT;
    v_luck_level INT;
    v_total_weight INT;
    v_random_val INT;
    v_cumulative_weight INT := 0;
    v_reward RECORD;
    v_res_type TEXT;
    v_res_name TEXT;
    v_res_id TEXT;
    v_res_amount INT;
    v_is_milestone BOOLEAN := FALSE;
    v_milestone_msg TEXT;
    v_badge_uuid UUID := 'df5e5bb7-48fc-44b4-9144-bab4d4cb0b57';
BEGIN
    -- 統計取得/作成
    INSERT INTO event_drill_user_stats (user_id) VALUES (target_user_id) ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO v_stats FROM event_drill_user_stats WHERE user_id = target_user_id FOR UPDATE;
    
    -- JSTリセット
    v_last_tap_jst := (v_stats.last_tap_at AT TIME ZONE 'Asia/Tokyo')::DATE;
    IF v_last_tap_jst < v_today_jst THEN v_stats.daily_taps := 0; END IF;
    
    -- 上限チェック
    IF v_stats.daily_taps >= v_daily_limit THEN
        RETURN jsonb_build_object('success', false, 'error', 'DAILY_LIMIT_REACHED');
    END IF;
    
    -- 深さ・レベル計算
    SELECT COALESCE(SUM(total_taps), 0) + 1 INTO v_global_depth FROM event_drill_user_stats;
    v_luck_level := LEAST(floor(v_global_depth / 1000)::INT, 10);
    
    -- 確定報酬判定
    IF v_global_depth % 10000 = 0 THEN
        v_is_milestone := TRUE;
        v_res_type := 'badge'; v_res_name := '【深淵を穿つ発掘王】';
        v_res_id := v_badge_uuid::text; v_res_amount := 0;
        v_milestone_msg := '10,000M到達！【限定バッジ】を掘り当てた！';
    ELSIF v_global_depth % 1000 = 0 THEN
        v_is_milestone := TRUE;
        v_res_type := 'gacha_ticket'; v_res_name := '祈願符(5枚)';
        v_res_id := NULL; v_res_amount := 5;
        v_milestone_msg := v_global_depth::text || 'M到達！祈願符5枚を掘り当てた！';
    ELSIF v_global_depth % 100 = 0 THEN
        v_is_milestone := TRUE;
        v_res_type := 'gacha_ticket'; v_res_name := '祈願符(1枚)';
        v_res_id := NULL; v_res_amount := 1;
        v_milestone_msg := v_global_depth::text || 'M到達！祈願符1枚を掘り当てた！';
    ELSE
        -- データベースから該当レベルの報酬を抽選
        SELECT SUM(probability_weight) INTO v_total_weight FROM event_drill_rewards WHERE level_id = v_luck_level AND is_active = TRUE;
        v_random_val := floor(random() * v_total_weight)::INT;
        
        FOR v_reward IN SELECT * FROM event_drill_rewards WHERE level_id = v_luck_level AND is_active = TRUE ORDER BY id LOOP
            v_cumulative_weight := v_cumulative_weight + v_reward.probability_weight;
            IF v_random_val < v_cumulative_weight THEN
                v_res_type := v_reward.reward_type;
                v_res_name := v_reward.reward_name;
                v_res_id := v_reward.reward_id;
                v_res_amount := v_reward.amount;
                EXIT;
            END IF;
        END LOOP;
    END IF;
    
    -- 報酬付与
    IF v_res_type = 'coin' THEN
        UPDATE profiles SET coins = coins + v_res_amount, total_assets = total_assets + v_res_amount WHERE discord_user_id = target_user_id;
    ELSIF v_res_type = 'gacha_ticket' THEN
        UPDATE profiles SET gacha_tickets = COALESCE(gacha_tickets, 0) + v_res_amount WHERE discord_user_id = target_user_id;
    ELSIF v_res_type = 'exchange_ticket' THEN
        UPDATE profiles SET exchange_tickets = jsonb_set(COALESCE(exchange_tickets, '{}'::jsonb), ARRAY[v_res_id], (COALESCE((exchange_tickets->>v_res_id)::int, 0) + v_res_amount)::text::jsonb) WHERE discord_user_id = target_user_id;
    ELSIF v_res_type = 'badge' THEN
        INSERT INTO user_badges_new (user_id, badge_id, purchased_price) VALUES (target_user_id, v_res_id::uuid, 0) ON CONFLICT DO NOTHING;
    END IF;
    
    -- 統計更新
    UPDATE event_drill_user_stats SET total_taps = total_taps + 1, daily_taps = v_stats.daily_taps + 1, last_tap_at = v_now WHERE user_id = target_user_id;
    
    -- ログ記録
    -- 遅延表示（過去の合計値取得）のため、ハズレ(nothing)の場合も必ず記録する
    INSERT INTO event_drill_logs (user_id, reward_type, reward_name, reward_id, amount, depth) 
    VALUES (
        target_user_id, 
        CASE WHEN v_is_milestone THEN 'milestone' ELSE v_res_type END, 
        CASE WHEN v_is_milestone THEN v_milestone_msg ELSE v_res_name END, 
        v_res_id, 
        v_res_amount, 
        v_global_depth
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'reward', jsonb_build_object('type', CASE WHEN v_is_milestone THEN 'milestone' ELSE v_res_type END, 'name', CASE WHEN v_is_milestone THEN v_milestone_msg ELSE v_res_name END, 'amount', v_res_amount, 'reward_id', v_res_id),
        'new_daily_taps', v_stats.daily_taps + 1,
        'total_taps', v_stats.total_taps + 1,
        'global_total_meters', v_global_depth,
        'luck_level', v_luck_level
    );
END;
$function$;

-- 1. ユーザー統計テーブル作成
CREATE TABLE IF NOT EXISTS event_drill_user_stats (
    user_id TEXT PRIMARY KEY REFERENCES profiles(discord_user_id),
    total_taps BIGINT DEFAULT 0,
    daily_taps INT DEFAULT 0,
    last_tap_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. イベント専用ログテーブル作成
CREATE TABLE IF NOT EXISTS event_drill_logs (
    id SERIAL PRIMARY KEY,
    user_id TEXT REFERENCES profiles(discord_user_id),
    reward_type TEXT,
    reward_name TEXT,
    reward_id TEXT,
    amount INT,
    depth BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 掘削ロジック (RPC修正版7: 動的報酬スケーリング)
CREATE OR REPLACE FUNCTION process_drill_tap(target_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_daily_limit CONSTANT INT := 100;
    v_stats RECORD;
    v_now TIMESTAMP WITH TIME ZONE := NOW();
    v_today_jst DATE := (v_now AT TIME ZONE 'Asia/Tokyo')::DATE;
    v_last_tap_jst DATE;
    v_global_depth BIGINT;
    v_luck_level INT;
    
    -- 動的報酬用変数
    v_nothing_weight INT;
    v_total_weight INT := 0;
    v_random_val INT;
    v_cumulative_weight INT := 0;
    
    -- 結果格納用
    v_res_type TEXT;
    v_res_name TEXT;
    v_res_id TEXT;
    v_res_amount INT;
    v_is_milestone BOOLEAN := FALSE;
    v_milestone_msg TEXT;
    v_badge_uuid UUID := 'c5b275e6-036b-49ef-9796-4b95ce46c53e';
    
    -- 報酬リスト用
    v_rewards JSONB;
    v_reward JSONB;
    v_i INT;
    
    -- コイン量計算用
    v_coin_small INT;
    v_coin_medium INT;
    v_coin_large INT;
BEGIN
    -- 統計取得/作成
    INSERT INTO event_drill_user_stats (user_id) VALUES (target_user_id) ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO v_stats FROM event_drill_user_stats WHERE user_id = target_user_id FOR UPDATE;
    
    -- JSTリセット判定
    v_last_tap_jst := (v_stats.last_tap_at AT TIME ZONE 'Asia/Tokyo')::DATE;
    IF v_last_tap_jst < v_today_jst THEN v_stats.daily_taps := 0; END IF;
    
    -- 上限チェック
    IF v_stats.daily_taps >= v_daily_limit THEN
        RETURN jsonb_build_object('success', false, 'error', 'DAILY_LIMIT_REACHED');
    END IF;
    
    -- 合計深さ計算
    SELECT COALESCE(SUM(total_taps), 0) + 1 INTO v_global_depth FROM event_drill_user_stats;
    v_luck_level := LEAST(floor(v_global_depth / 1000)::INT, 10);
    
    -- コイン量の動的計算
    v_coin_small := 1 + floor(v_global_depth / 2000)::INT * 1; -- 1→5 (2000Mごと)
    v_coin_small := LEAST(v_coin_small, 5);
    v_coin_medium := 3 + floor(v_global_depth / 1000)::INT * 3; -- 3→30 (1000Mごと)
    v_coin_medium := LEAST(v_coin_medium, 30);
    v_coin_large := 10 + floor(v_global_depth / 1000)::INT * 10; -- 10→100 (1000Mごと)
    v_coin_large := LEAST(v_coin_large, 100);
    
    -- 確定報酬判定 (優先度: 10000 > 1000 > 100)
    IF v_global_depth % 10000 = 0 THEN
        v_is_milestone := TRUE;
        v_res_type := 'badge'; v_res_name := '【不屈の求道者】';
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
        -- 動的報酬リスト構築
        v_nothing_weight := 9000 - (v_luck_level * 200); -- 9000→7000
        
        v_rewards := jsonb_build_array(
            jsonb_build_object('type', 'nothing', 'name', 'ハズレ', 'id', NULL, 'amount', 0, 'weight', v_nothing_weight),
            jsonb_build_object('type', 'coin', 'name', v_coin_small || 'コイン', 'id', NULL, 'amount', v_coin_small, 'weight', 600),
            jsonb_build_object('type', 'coin', 'name', v_coin_medium || 'コイン', 'id', NULL, 'amount', v_coin_medium, 'weight', 150),
            jsonb_build_object('type', 'coin', 'name', v_coin_large || 'コイン', 'id', NULL, 'amount', v_coin_large, 'weight', 50),
            jsonb_build_object('type', 'exchange_ticket', 'name', CASE WHEN v_global_depth >= 5000 THEN '一般引換券(2枚)' ELSE '一般引換券(1枚)' END, 'id', '一般', 'amount', CASE WHEN v_global_depth >= 5000 THEN 2 ELSE 1 END, 'weight', 50),
            jsonb_build_object('type', 'gacha_ticket', 'name', '祈願符(1枚)', 'id', NULL, 'amount', 1, 'weight', 100),
            jsonb_build_object('type', 'badge', 'name', '【不屈の求道者】', 'id', v_badge_uuid::text, 'amount', 0, 'weight', 1)
        );
        
        -- 深さに応じてアンロック
        IF v_global_depth >= 2000 THEN
            v_rewards := v_rewards || jsonb_build_array(jsonb_build_object('type', 'exchange_ticket', 'name', '良質引換券(1枚)', 'id', '良質', 'amount', 1, 'weight', 30));
        END IF;
        IF v_global_depth >= 4000 THEN
            v_rewards := v_rewards || jsonb_build_array(jsonb_build_object('type', 'exchange_ticket', 'name', '希少・Ⅰ引換券(1枚)', 'id', '希少・Ⅰ', 'amount', 1, 'weight', 20));
        END IF;
        IF v_global_depth >= 5000 THEN
            v_rewards := v_rewards || jsonb_build_array(jsonb_build_object('type', 'gacha_ticket', 'name', '祈願符(3枚)', 'id', NULL, 'amount', 3, 'weight', 30));
        END IF;
        IF v_global_depth >= 6000 THEN
            v_rewards := v_rewards || jsonb_build_array(jsonb_build_object('type', 'exchange_ticket', 'name', '希少・Ⅱ引換券(1枚)', 'id', '希少・Ⅱ', 'amount', 1, 'weight', 15));
        END IF;
        IF v_global_depth >= 8000 THEN
            v_rewards := v_rewards || jsonb_build_array(jsonb_build_object('type', 'exchange_ticket', 'name', '貴重引換券(1枚)', 'id', '貴重', 'amount', 1, 'weight', 10));
        END IF;
        IF v_global_depth >= 10000 THEN
            v_rewards := v_rewards || jsonb_build_array(jsonb_build_object('type', 'exchange_ticket', 'name', '特上引換券(1枚)', 'id', '特上', 'amount', 1, 'weight', 4));
        END IF;
        
        -- 合計ウェイト計算
        FOR v_i IN 0..jsonb_array_length(v_rewards) - 1 LOOP
            v_total_weight := v_total_weight + (v_rewards->v_i->>'weight')::INT;
        END LOOP;
        
        -- 抽選
        v_random_val := floor(random() * v_total_weight)::INT;
        v_cumulative_weight := 0;
        
        FOR v_i IN 0..jsonb_array_length(v_rewards) - 1 LOOP
            v_reward := v_rewards->v_i;
            v_cumulative_weight := v_cumulative_weight + (v_reward->>'weight')::INT;
            IF v_random_val < v_cumulative_weight THEN
                v_res_type := v_reward->>'type';
                v_res_name := v_reward->>'name';
                v_res_id := v_reward->>'id';
                v_res_amount := (v_reward->>'amount')::INT;
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
    IF v_is_milestone THEN
        INSERT INTO event_drill_logs (user_id, reward_type, reward_name, reward_id, amount, depth) VALUES (target_user_id, 'milestone', v_milestone_msg, v_res_id, v_res_amount, v_global_depth);
    ELSIF v_res_type != 'nothing' THEN
        INSERT INTO event_drill_logs (user_id, reward_type, reward_name, reward_id, amount, depth) VALUES (target_user_id, v_res_type, v_res_name, v_res_id, v_res_amount, v_global_depth);
    END IF;
    
    RETURN jsonb_build_object(
        'success', true,
        'reward', jsonb_build_object('type', CASE WHEN v_is_milestone THEN 'milestone' ELSE v_res_type END, 'name', CASE WHEN v_is_milestone THEN v_milestone_msg ELSE v_res_name END, 'amount', v_res_amount, 'reward_id', v_res_id),
        'new_daily_taps', v_stats.daily_taps + 1,
        'total_taps', v_stats.total_taps + 1,
        'global_total_meters', v_global_depth,
        'luck_level', v_luck_level
    );
END;
$$;

-- 4. ドリル修理
CREATE OR REPLACE FUNCTION repair_drill(target_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cost CONSTANT INT := 100;
    v_user_coins INT;
BEGIN
    SELECT coins INTO v_user_coins FROM profiles WHERE discord_user_id = target_user_id;
    IF v_user_coins < v_cost THEN RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_COINS'); END IF;
    UPDATE profiles SET coins = coins - v_cost WHERE discord_user_id = target_user_id;
    UPDATE event_drill_user_stats SET daily_taps = 0 WHERE user_id = target_user_id;
    RETURN jsonb_build_object('success', true, 'new_coins', v_user_coins - v_cost);
END;
$$;

-- 5. 提供割合取得用RPC (フロントエンド表示用)
CREATE OR REPLACE FUNCTION get_drill_rewards_preview(current_depth BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_luck_level INT := LEAST(floor(current_depth / 1000)::INT, 10);
    v_nothing_weight INT := 9000 - (v_luck_level * 200);
    v_coin_small INT := LEAST(1 + floor(current_depth / 2000)::INT, 5);
    v_coin_medium INT := LEAST(3 + floor(current_depth / 1000)::INT * 3, 30);
    v_coin_large INT := LEAST(10 + floor(current_depth / 1000)::INT * 10, 100);
    v_rewards JSONB;
BEGIN
    v_rewards := jsonb_build_array(
        jsonb_build_object('name', 'ハズレ', 'weight', v_nothing_weight),
        jsonb_build_object('name', v_coin_small || 'コイン', 'weight', 600),
        jsonb_build_object('name', v_coin_medium || 'コイン', 'weight', 150),
        jsonb_build_object('name', v_coin_large || 'コイン', 'weight', 50),
        jsonb_build_object('name', CASE WHEN current_depth >= 5000 THEN '一般引換券(2枚)' ELSE '一般引換券(1枚)' END, 'weight', 50),
        jsonb_build_object('name', '祈願符(1枚)', 'weight', 100),
        jsonb_build_object('name', '【不屈の求道者】', 'weight', 1)
    );
    IF current_depth >= 2000 THEN v_rewards := v_rewards || jsonb_build_array(jsonb_build_object('name', '良質引換券(1枚)', 'weight', 30)); END IF;
    IF current_depth >= 4000 THEN v_rewards := v_rewards || jsonb_build_array(jsonb_build_object('name', '希少・Ⅰ引換券(1枚)', 'weight', 20)); END IF;
    IF current_depth >= 5000 THEN v_rewards := v_rewards || jsonb_build_array(jsonb_build_object('name', '祈願符(3枚)', 'weight', 30)); END IF;
    IF current_depth >= 6000 THEN v_rewards := v_rewards || jsonb_build_array(jsonb_build_object('name', '希少・Ⅱ引換券(1枚)', 'weight', 15)); END IF;
    IF current_depth >= 8000 THEN v_rewards := v_rewards || jsonb_build_array(jsonb_build_object('name', '貴重引換券(1枚)', 'weight', 10)); END IF;
    IF current_depth >= 10000 THEN v_rewards := v_rewards || jsonb_build_array(jsonb_build_object('name', '特上引換券(1枚)', 'weight', 4)); END IF;
    RETURN v_rewards;
END;
$$;


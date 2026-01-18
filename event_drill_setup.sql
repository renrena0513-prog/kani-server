-- 1. ユーザー統計テーブル作成
CREATE TABLE IF NOT EXISTS event_drill_user_stats (
    user_id TEXT PRIMARY KEY REFERENCES profiles(discord_user_id),
    total_taps BIGINT DEFAULT 0,
    daily_taps INT DEFAULT 0,
    last_tap_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 報酬テーブル作成
CREATE TABLE IF NOT EXISTS event_drill_rewards (
    id SERIAL PRIMARY KEY,
    reward_type TEXT NOT NULL, -- 'coin', 'ticket', 'badge', 'nothing'
    reward_id TEXT,             -- バッジIDや引換券名
    amount INT DEFAULT 0,       -- コインの量
    probability_weight INT DEFAULT 100,
    is_active BOOLEAN DEFAULT TRUE,
    reward_name TEXT            -- 表示用の名前
);

-- 3. イベント専用ログテーブル作成
CREATE TABLE IF NOT EXISTS event_drill_logs (
    id SERIAL PRIMARY KEY,
    user_id TEXT REFERENCES profiles(discord_user_id),
    reward_type TEXT,
    reward_name TEXT,
    reward_id TEXT,
    amount INT,
    depth INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. 初期報酬データ投入 (UUID対応版)
TRUNCATE event_drill_rewards;
INSERT INTO event_drill_rewards (reward_type, reward_name, reward_id, amount, probability_weight) VALUES 
('nothing', 'ハズレ', NULL, 0, 700),
('coin', '10コイン', NULL, 10, 200),
('coin', '50コイン', NULL, 50, 50),
('gacha_ticket', '祈願符(1枚)', NULL, 1, 30),
('coin', '100コイン', NULL, 100, 15),
('exchange_ticket', '一般引換券', '一般', 1, 5),
('badge', '【不屈の求道者】', 'c5b275e6-036b-49ef-9796-4b95ce46c53e', 0, 1);

-- 5. 掘削ロジック (RPC修正版5: 確定報酬、確率変動、修理機能)
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
    v_reward RECORD;
    v_total_weight INT;
    v_random_val INT;
    v_cumulative_weight INT := 0;
    v_global_depth BIGINT;
    v_luck_level INT;
    v_nothing_weight_reduction INT;
    v_is_milestone BOOLEAN := FALSE;
    v_milestone_msg TEXT;
    v_badge_uuid UUID := 'c5b275e6-036b-49ef-9796-4b95ce46c53e'; -- 【不屈の求道者】
BEGIN
    -- 現在の統計を取得 (なければ作成)
    INSERT INTO event_drill_user_stats (user_id)
    VALUES (target_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT * INTO v_stats FROM event_drill_user_stats WHERE user_id = target_user_id FOR UPDATE;

    -- JSTでの日付リセット判定
    v_last_tap_jst := (v_stats.last_tap_at AT TIME ZONE 'Asia/Tokyo')::DATE;
    
    IF v_last_tap_jst < v_today_jst THEN
        v_stats.daily_taps := 0;
    END IF;

    -- 上限チェック
    IF v_stats.daily_taps >= v_daily_limit THEN
        RETURN jsonb_build_object('success', false, 'error', 'DAILY_LIMIT_REACHED');
    END IF;

    -- 合計の深さを事前に計算 (確定報酬判定用)
    SELECT COALESCE(SUM(total_taps), 0) + 1 INTO v_global_depth FROM event_drill_user_stats;

    -- 確定報酬判定 (優先度: 10000 > 1000 > 100)
    IF v_global_depth % 10000 = 0 THEN
        v_is_milestone := TRUE;
        v_reward.reward_type := 'badge';
        v_reward.reward_name := '【不屈の求道者】';
        v_reward.reward_id := v_badge_uuid::text;
        v_reward.amount := 0;
        v_milestone_msg := '10,000M到達！【限定バッジ】を掘り当てた！';
    ELSIF v_global_depth % 1000 = 0 THEN
        v_is_milestone := TRUE;
        v_reward.reward_type := 'gacha_ticket';
        v_reward.reward_name := '祈願符(5枚)';
        v_reward.reward_id := NULL;
        v_reward.amount := 5;
        v_milestone_msg := v_global_depth::text || 'M到達！祈願符5枚を掘り当てた！';
    ELSIF v_global_depth % 100 = 0 THEN
        v_is_milestone := TRUE;
        v_reward.reward_type := 'gacha_ticket';
        v_reward.reward_name := '祈願符(1枚)';
        v_reward.reward_id := NULL;
        v_reward.amount := 1;
        v_milestone_msg := v_global_depth::text || 'M到達！祈願符1枚を掘り当てた！';
    ELSE
        -- 通常の抽選ロジック (確率変動あり)
        v_luck_level := LEAST(floor(v_global_depth / 1000), 10);
        v_nothing_weight_reduction := v_luck_level * 50; -- Lv1ごとにハズレ重みを-50 (Lv10で-500)

        SELECT SUM(CASE 
            WHEN reward_type = 'nothing' THEN GREATEST(probability_weight - v_nothing_weight_reduction, 50)
            ELSE probability_weight 
        END) INTO v_total_weight FROM event_drill_rewards WHERE is_active = TRUE;

        v_random_val := floor(random() * v_total_weight);

        FOR v_reward IN SELECT *, 
            CASE WHEN reward_type = 'nothing' THEN GREATEST(probability_weight - v_nothing_weight_reduction, 50) ELSE probability_weight END as current_weight 
            FROM event_drill_rewards WHERE is_active = TRUE ORDER BY id LOOP
            
            v_cumulative_weight := v_cumulative_weight + v_reward.current_weight;
            IF v_random_val < v_cumulative_weight THEN
                EXIT;
            END IF;
        END LOOP;
    END IF;

    -- ユーザー情報の更新 (コイン等)
    IF v_reward.reward_type = 'coin' THEN
        UPDATE profiles SET coins = coins + v_reward.amount, total_assets = total_assets + v_reward.amount WHERE discord_user_id = target_user_id;
    ELSIF v_reward.reward_type = 'gacha_ticket' THEN
        UPDATE profiles SET gacha_tickets = COALESCE(gacha_tickets, 0) + v_reward.amount WHERE discord_user_id = target_user_id;
    ELSIF v_reward.reward_type = 'exchange_ticket' THEN
        UPDATE profiles 
        SET exchange_tickets = jsonb_set(
            COALESCE(exchange_tickets, '{}'::jsonb),
            ARRAY[v_reward.reward_id],
            (COALESCE((exchange_tickets->>v_reward.reward_id)::int, 0) + v_reward.amount)::text::jsonb
        )
        WHERE discord_user_id = target_user_id;
    ELSIF v_reward.reward_type = 'badge' THEN
        INSERT INTO user_badges_new (user_id, badge_id, purchased_price)
        VALUES (target_user_id, v_reward.reward_id::uuid, 0);
    END IF;

    -- 統計の更新
    UPDATE event_drill_user_stats SET
        total_taps = total_taps + 1,
        daily_taps = v_stats.daily_taps + 1,
        last_tap_at = v_now
    WHERE user_id = target_user_id;

    -- 活動ログの記録
    IF v_is_milestone THEN
        INSERT INTO event_drill_logs (user_id, reward_type, reward_name, reward_id, amount, depth)
        VALUES (target_user_id, 'milestone', v_milestone_msg, v_reward.reward_id, v_reward.amount, v_global_depth);
    ELSIF v_reward.reward_type != 'nothing' THEN
        INSERT INTO event_drill_logs (user_id, reward_type, reward_name, reward_id, amount, depth)
        VALUES (target_user_id, v_reward.reward_type, v_reward.reward_name, v_reward.reward_id, v_reward.amount, v_global_depth);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'reward', jsonb_build_object(
            'type', CASE WHEN v_is_milestone THEN 'milestone' ELSE v_reward.reward_type END,
            'name', CASE WHEN v_is_milestone THEN v_milestone_msg ELSE v_reward.reward_name END,
            'amount', v_reward.amount,
            'reward_id', v_reward.reward_id
        ),
        'new_daily_taps', v_stats.daily_taps + 1,
        'total_taps', v_stats.total_taps + 1,
        'global_total_meters', v_global_depth,
        'luck_level', LEAST(floor(v_global_depth / 1000), 10)
    );
END;
$$;

-- 6. ドリル修理 (上限リセット)
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
    
    IF v_user_coins < v_cost THEN
        RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_COINS');
    END IF;

    -- コイン減算
    UPDATE profiles SET coins = coins - v_cost WHERE discord_user_id = target_user_id;

    -- 日数制限リセット
    UPDATE event_drill_user_stats SET daily_taps = 0 WHERE user_id = target_user_id;

    RETURN jsonb_build_object('success', true, 'new_coins', v_user_coins - v_cost);
END;
$$;

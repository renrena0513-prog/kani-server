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

-- 3. 初期報酬データ投入 (修正版)
TRUNCATE event_drill_rewards;
INSERT INTO event_drill_rewards (reward_type, reward_name, reward_id, amount, probability_weight) VALUES 
('nothing', 'ハズレ', NULL, 0, 700),
('coin', '10コイン', NULL, 10, 200),
('coin', '50コイン', NULL, 50, 50),
('gacha_ticket', '祈願符(1枚)', NULL, 1, 30),
('coin', '100コイン', NULL, 100, 15),
('exchange_ticket', '一般引換券', '一般', 1, 5),
('badge', '限定バッジ', '1', 0, 1); -- TODO: 実際の限定バッジIDが決まれば更新

-- 4. 掘削ロジック (RPC修正版)
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
    v_result JSONB;
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

    -- 報酬の抽選
    SELECT SUM(probability_weight) INTO v_total_weight FROM event_drill_rewards WHERE is_active = TRUE;
    v_random_val := floor(random() * v_total_weight);

    FOR v_reward IN SELECT * FROM event_drill_rewards WHERE is_active = TRUE ORDER BY id LOOP
        v_cumulative_weight := v_cumulative_weight + v_reward.probability_weight;
        IF v_random_val < v_cumulative_weight THEN
            EXIT;
        END IF;
    END LOOP;

    -- ユーザー情報の更新 (コイン等)
    IF v_reward.reward_type = 'coin' THEN
        UPDATE profiles SET coins = coins + v_reward.amount, total_assets = total_assets + v_reward.amount WHERE discord_user_id = target_user_id;
    ELSIF v_reward.reward_type = 'gacha_ticket' THEN
        -- 祈願符の更新
        UPDATE profiles SET gacha_tickets = COALESCE(gacha_tickets, 0) + v_reward.amount WHERE discord_user_id = target_user_id;
    ELSIF v_reward.reward_type = 'exchange_ticket' THEN
        -- exchange_tickets (jsonb) の更新
        UPDATE profiles 
        SET exchange_tickets = jsonb_set(
            COALESCE(exchange_tickets, '{}'::jsonb),
            ARRAY[v_reward.reward_id],
            (COALESCE((exchange_tickets->>v_reward.reward_id)::int, 0) + v_reward.amount)::text::jsonb
        )
        WHERE discord_user_id = target_user_id;
    ELSIF v_reward.reward_type = 'badge' THEN
        -- バッジの付与
        INSERT INTO user_badges_new (user_id, badge_id, purchased_price)
        VALUES (target_user_id, v_reward.reward_id::int, 0);
    END IF;

    -- 統計の更新
    UPDATE event_drill_user_stats SET
        total_taps = total_taps + 1,
        daily_taps = v_stats.daily_taps + 1,
        last_tap_at = v_now
    WHERE user_id = target_user_id;

    -- 活動ログの記録
    IF v_reward.reward_type != 'nothing' THEN
        INSERT INTO activity_logs (user_id, action_type, amount, badge_id, details)
        VALUES (
            target_user_id, 
            'drill_reward', 
            CASE WHEN v_reward.reward_type = 'coin' THEN v_reward.amount ELSE NULL END, 
            CASE WHEN v_reward.reward_type = 'badge' THEN v_reward.reward_id::int ELSE NULL END, 
            jsonb_build_object(
                'reward_name', v_reward.reward_name,
                'reward_type', v_reward.reward_type,
                'depth', v_stats.total_taps + 1
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'reward', jsonb_build_object(
            'type', v_reward.reward_type,
            'name', v_reward.reward_name,
            'amount', v_reward.amount,
            'reward_id', v_reward.reward_id
        ),
        'new_daily_taps', v_stats.daily_taps + 1,
        'total_taps', v_stats.total_taps + 1
    );
END;
$$;

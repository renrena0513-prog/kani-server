-- =============================================
-- ほりほりドリル イベント設定 (データベース駆動版)
-- =============================================

-- 1. ユーザー統計テーブル
CREATE TABLE IF NOT EXISTS event_drill_user_stats (
    user_id TEXT PRIMARY KEY REFERENCES profiles(discord_user_id),
    total_taps BIGINT DEFAULT 0,
    daily_taps INT DEFAULT 0,
    last_tap_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. イベント専用ログテーブル
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

-- 3. 報酬テーブル (レベル別管理) - 古いテーブルを削除して再作成
DROP TABLE IF EXISTS event_drill_rewards;
CREATE TABLE event_drill_rewards (
    id SERIAL PRIMARY KEY,
    level_id INT NOT NULL,           -- 0-10 (地盤レベル)
    reward_type TEXT NOT NULL,       -- 'nothing', 'coin', 'gacha_ticket', 'exchange_ticket', 'badge'
    reward_name TEXT NOT NULL,
    reward_id TEXT,                  -- バッジUUID or 引換券名
    amount INT DEFAULT 0,
    probability_weight INT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

-- ============================================
-- 初期化セクション (新規イベント開始時に実行)
-- ============================================
-- TRUNCATE event_drill_user_stats CASCADE;
-- TRUNCATE event_drill_logs CASCADE;
-- ============================================

-- =============================================
-- レベル別報酬データ投入 (Lv0 ~ Lv10)
-- ============================================='
-- Lv0 (0-999M): ハズレ9000, コイン1/3/10
INSERT INTO event_drill_rewards (level_id, reward_type, reward_name, reward_id, amount, probability_weight) VALUES
(0, 'nothing', 'ハズレ', NULL, 0, 9000),
(0, 'coin', '1コイン', NULL, 1, 600),
(0, 'coin', '3コイン', NULL, 3, 150),
(0, 'coin', '10コイン', NULL, 10, 50),
(0, 'exchange_ticket', '一般引換券(1枚)', '一般', 1, 50),
(0, 'gacha_ticket', '祈願符(1枚)', NULL, 1, 100),
(0, 'badge', '【深淵を穿つ発掘王】', 'df5e5bb7-48fc-44b4-9144-bab4d4cb0b57', 0, 1);

-- Lv1 (1000-1999M): ハズレ8800, コイン1/6/20
INSERT INTO event_drill_rewards (level_id, reward_type, reward_name, reward_id, amount, probability_weight) VALUES
(1, 'nothing', 'ハズレ', NULL, 0, 8800),
(1, 'coin', '1コイン', NULL, 1, 600),
(1, 'coin', '6コイン', NULL, 6, 150),
(1, 'coin', '20コイン', NULL, 20, 50),
(1, 'exchange_ticket', '一般引換券(1枚)', '一般', 1, 50),
(1, 'gacha_ticket', '祈願符(1枚)', NULL, 1, 100),
(1, 'badge', '【深淵を穿つ発掘王】', 'df5e5bb7-48fc-44b4-9144-bab4d4cb0b57', 0, 1);

-- Lv2 (2000-2999M): ハズレ8600, コイン2/9/30, +良質
INSERT INTO event_drill_rewards (level_id, reward_type, reward_name, reward_id, amount, probability_weight) VALUES
(2, 'nothing', 'ハズレ', NULL, 0, 8600),
(2, 'coin', '2コイン', NULL, 2, 600),
(2, 'coin', '9コイン', NULL, 9, 150),
(2, 'coin', '30コイン', NULL, 30, 50),
(2, 'exchange_ticket', '一般引換券(1枚)', '一般', 1, 50),
(2, 'exchange_ticket', '良質引換券(1枚)', '良質', 1, 30),
(2, 'gacha_ticket', '祈願符(1枚)', NULL, 1, 100),
(2, 'badge', '【深淵を穿つ発掘王】', 'df5e5bb7-48fc-44b4-9144-bab4d4cb0b57', 0, 1);

-- Lv3 (3000-3999M): ハズレ8400, コイン2/12/40, +良質
INSERT INTO event_drill_rewards (level_id, reward_type, reward_name, reward_id, amount, probability_weight) VALUES
(3, 'nothing', 'ハズレ', NULL, 0, 8400),
(3, 'coin', '2コイン', NULL, 2, 600),
(3, 'coin', '12コイン', NULL, 12, 150),
(3, 'coin', '40コイン', NULL, 40, 50),
(3, 'exchange_ticket', '一般引換券(1枚)', '一般', 1, 50),
(3, 'exchange_ticket', '良質引換券(1枚)', '良質', 1, 30),
(3, 'gacha_ticket', '祈願符(1枚)', NULL, 1, 100),
(3, 'badge', '【深淵を穿つ発掘王】', 'df5e5bb7-48fc-44b4-9144-bab4d4cb0b57', 0, 1);

-- Lv4 (4000-4999M): ハズレ8200, コイン3/15/50, +良質+希少Ⅰ
INSERT INTO event_drill_rewards (level_id, reward_type, reward_name, reward_id, amount, probability_weight) VALUES
(4, 'nothing', 'ハズレ', NULL, 0, 8200),
(4, 'coin', '3コイン', NULL, 3, 600),
(4, 'coin', '15コイン', NULL, 15, 150),
(4, 'coin', '50コイン', NULL, 50, 50),
(4, 'exchange_ticket', '一般引換券(1枚)', '一般', 1, 50),
(4, 'exchange_ticket', '良質引換券(1枚)', '良質', 1, 30),
(4, 'exchange_ticket', '希少・Ⅰ引換券(1枚)', '希少・Ⅰ', 1, 20),
(4, 'gacha_ticket', '祈願符(1枚)', NULL, 1, 100),
(4, 'badge', '【深淵を穿つ発掘王】', 'df5e5bb7-48fc-44b4-9144-bab4d4cb0b57', 0, 1);

-- Lv5 (5000-5999M): ハズレ8000, コイン3/18/60, 一般2枚, +祈願符3枚
INSERT INTO event_drill_rewards (level_id, reward_type, reward_name, reward_id, amount, probability_weight) VALUES
(5, 'nothing', 'ハズレ', NULL, 0, 8000),
(5, 'coin', '3コイン', NULL, 3, 600),
(5, 'coin', '18コイン', NULL, 18, 150),
(5, 'coin', '60コイン', NULL, 60, 50),
(5, 'exchange_ticket', '一般引換券(2枚)', '一般', 2, 50),
(5, 'exchange_ticket', '良質引換券(1枚)', '良質', 1, 30),
(5, 'exchange_ticket', '希少・Ⅰ引換券(1枚)', '希少・Ⅰ', 1, 20),
(5, 'gacha_ticket', '祈願符(1枚)', NULL, 1, 100),
(5, 'gacha_ticket', '祈願符(3枚)', NULL, 3, 30),
(5, 'badge', '【深淵を穿つ発掘王】', 'df5e5bb7-48fc-44b4-9144-bab4d4cb0b57', 0, 1);

-- Lv6 (6000-6999M): ハズレ7800, コイン4/21/70, +希少Ⅱ
INSERT INTO event_drill_rewards (level_id, reward_type, reward_name, reward_id, amount, probability_weight) VALUES
(6, 'nothing', 'ハズレ', NULL, 0, 7800),
(6, 'coin', '4コイン', NULL, 4, 600),
(6, 'coin', '21コイン', NULL, 21, 150),
(6, 'coin', '70コイン', NULL, 70, 50),
(6, 'exchange_ticket', '一般引換券(2枚)', '一般', 2, 50),
(6, 'exchange_ticket', '良質引換券(1枚)', '良質', 1, 30),
(6, 'exchange_ticket', '希少・Ⅰ引換券(1枚)', '希少・Ⅰ', 1, 20),
(6, 'exchange_ticket', '希少・Ⅱ引換券(1枚)', '希少・Ⅱ', 1, 15),
(6, 'gacha_ticket', '祈願符(1枚)', NULL, 1, 100),
(6, 'gacha_ticket', '祈願符(3枚)', NULL, 3, 30),
(6, 'badge', '【深淵を穿つ発掘王】', 'df5e5bb7-48fc-44b4-9144-bab4d4cb0b57', 0, 1);

-- Lv7 (7000-7999M): ハズレ7600, コイン4/24/80
INSERT INTO event_drill_rewards (level_id, reward_type, reward_name, reward_id, amount, probability_weight) VALUES
(7, 'nothing', 'ハズレ', NULL, 0, 7600),
(7, 'coin', '4コイン', NULL, 4, 600),
(7, 'coin', '24コイン', NULL, 24, 150),
(7, 'coin', '80コイン', NULL, 80, 50),
(7, 'exchange_ticket', '一般引換券(2枚)', '一般', 2, 50),
(7, 'exchange_ticket', '良質引換券(1枚)', '良質', 1, 30),
(7, 'exchange_ticket', '希少・Ⅰ引換券(1枚)', '希少・Ⅰ', 1, 20),
(7, 'exchange_ticket', '希少・Ⅱ引換券(1枚)', '希少・Ⅱ', 1, 15),
(7, 'gacha_ticket', '祈願符(1枚)', NULL, 1, 100),
(7, 'gacha_ticket', '祈願符(3枚)', NULL, 3, 30),
(7, 'badge', '【深淵を穿つ発掘王】', 'df5e5bb7-48fc-44b4-9144-bab4d4cb0b57', 0, 1);

-- Lv8 (8000-8999M): ハズレ7400, コイン5/27/90, +貴重
INSERT INTO event_drill_rewards (level_id, reward_type, reward_name, reward_id, amount, probability_weight) VALUES
(8, 'nothing', 'ハズレ', NULL, 0, 7400),
(8, 'coin', '5コイン', NULL, 5, 600),
(8, 'coin', '27コイン', NULL, 27, 150),
(8, 'coin', '90コイン', NULL, 90, 50),
(8, 'exchange_ticket', '一般引換券(2枚)', '一般', 2, 50),
(8, 'exchange_ticket', '良質引換券(1枚)', '良質', 1, 30),
(8, 'exchange_ticket', '希少・Ⅰ引換券(1枚)', '希少・Ⅰ', 1, 20),
(8, 'exchange_ticket', '希少・Ⅱ引換券(1枚)', '希少・Ⅱ', 1, 15),
(8, 'exchange_ticket', '貴重引換券(1枚)', '貴重', 1, 10),
(8, 'gacha_ticket', '祈願符(1枚)', NULL, 1, 100),
(8, 'gacha_ticket', '祈願符(3枚)', NULL, 3, 30),
(8, 'badge', '【深淵を穿つ発掘王】', 'df5e5bb7-48fc-44b4-9144-bab4d4cb0b57', 0, 1);

-- Lv9 (9000-9999M): ハズレ7200, コイン5/30/100
INSERT INTO event_drill_rewards (level_id, reward_type, reward_name, reward_id, amount, probability_weight) VALUES
(9, 'nothing', 'ハズレ', NULL, 0, 7200),
(9, 'coin', '5コイン', NULL, 5, 600),
(9, 'coin', '30コイン', NULL, 30, 150),
(9, 'coin', '100コイン', NULL, 100, 50),
(9, 'exchange_ticket', '一般引換券(2枚)', '一般', 2, 50),
(9, 'exchange_ticket', '良質引換券(1枚)', '良質', 1, 30),
(9, 'exchange_ticket', '希少・Ⅰ引換券(1枚)', '希少・Ⅰ', 1, 20),
(9, 'exchange_ticket', '希少・Ⅱ引換券(1枚)', '希少・Ⅱ', 1, 15),
(9, 'exchange_ticket', '貴重引換券(1枚)', '貴重', 1, 10),
(9, 'gacha_ticket', '祈願符(1枚)', NULL, 1, 100),
(9, 'gacha_ticket', '祈願符(3枚)', NULL, 3, 30),
(9, 'badge', '【深淵を穿つ発掘王】', 'df5e5bb7-48fc-44b4-9144-bab4d4cb0b57', 0, 1);

-- Lv10 (10000M+): ハズレ7000, コイン5/30/100, +特上
INSERT INTO event_drill_rewards (level_id, reward_type, reward_name, reward_id, amount, probability_weight) VALUES
(10, 'nothing', 'ハズレ', NULL, 0, 7000),
(10, 'coin', '5コイン', NULL, 5, 600),
(10, 'coin', '30コイン', NULL, 30, 150),
(10, 'coin', '100コイン', NULL, 100, 50),
(10, 'exchange_ticket', '一般引換券(2枚)', '一般', 2, 50),
(10, 'exchange_ticket', '良質引換券(1枚)', '良質', 1, 30),
(10, 'exchange_ticket', '希少・Ⅰ引換券(1枚)', '希少・Ⅰ', 1, 20),
(10, 'exchange_ticket', '希少・Ⅱ引換券(1枚)', '希少・Ⅱ', 1, 15),
(10, 'exchange_ticket', '貴重引換券(1枚)', '貴重', 1, 10),
(10, 'exchange_ticket', '特上引換券(1枚)', '特上', 1, 4),
(10, 'gacha_ticket', '祈願符(1枚)', NULL, 1, 100),
(10, 'gacha_ticket', '祈願符(3枚)', NULL, 3, 30),
(10, 'badge', '【深淵を穿つ発掘王】', 'df5e5bb7-48fc-44b4-9144-bab4d4cb0b57', 0, 1);

-- =============================================
-- 4. 掘削ロジック (データベース駆動版)
-- =============================================
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

-- =============================================
-- 5. ドリル修理
-- =============================================
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

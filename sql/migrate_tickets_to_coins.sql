-- 引換券廃止に伴う一括換金スクリプト
-- 全ユーザーの exchange_tickets を読み取り、指定レートで換金して coins と total_assets に加算する。
-- 処理後、exchange_tickets は空のJSONBオブジェクト '{}' に更新される。
-- 実行内容のログは activity_logs に 'ticket_auto_exchange' として記録される。

DO $$
DECLARE
    r RECORD;
    count INT;
    rate INT;
    user_total INT;
    tickets JSONB;
    key TEXT;
    val JSONB;
    processed_count INT := 0;
BEGIN
    RAISE NOTICE 'Starting batch ticket exchange...';

    FOR r IN SELECT discord_user_id, exchange_tickets FROM public.profiles WHERE exchange_tickets IS NOT NULL AND exchange_tickets != '{}'::jsonb LOOP
        user_total := 0;
        tickets := r.exchange_tickets;
        
        -- 各レアリティの枚数を集計
        FOR key, val IN SELECT * FROM jsonb_each(tickets) LOOP
            BEGIN
                count := val::int;
            EXCEPTION WHEN OTHERS THEN
                count := 0;
            END;

            rate := 0;
            
            CASE key
                WHEN '一般' THEN rate := 25;
                WHEN '良質' THEN rate := 60;
                WHEN '希少・Ⅰ' THEN rate := 85;
                WHEN '希少・Ⅱ' THEN rate := 150;
                WHEN '貴重' THEN rate := 250;
                WHEN '特上' THEN rate := 350;
                WHEN '極上' THEN rate := 500;
                ELSE rate := 0; -- 未定義の種別は0コイン計算（または無視）
            END CASE;
            
            IF rate > 0 AND count > 0 THEN
                user_total := user_total + (rate * count);
            END IF;
        END LOOP;
        
        -- 換金対象がある場合のみ更新
        IF user_total > 0 THEN
            -- コインと資産を加算、チケットを空にする
            UPDATE public.profiles 
            SET coins = coins + user_total,
                total_assets = total_assets + user_total,
                exchange_tickets = '{}'::jsonb
            WHERE discord_user_id = r.discord_user_id;
            
            -- 活動ログ記録
            INSERT INTO public.activity_logs (user_id, action_type, amount, details)
            VALUES (
                r.discord_user_id, 
                'ticket_auto_exchange', 
                user_total, 
                json_build_object(
                    'reason', '引換券廃止に伴う一括換金', 
                    'original_tickets', tickets,
                    'converted_coins', user_total
                )
            );
            
            processed_count := processed_count + 1;
            RAISE NOTICE 'User %: Converted tickets to % coins', r.discord_user_id, user_total;
        ELSE
            -- 価値のないチケットしか持っていない、または枚数が0の場合もチケットデータはクリアする（廃止のため）
            UPDATE public.profiles SET exchange_tickets = '{}'::jsonb WHERE discord_user_id = r.discord_user_id;
        END IF;
    END LOOP;

    RAISE NOTICE 'Batch completed. Processed % users.', processed_count;
END $$;

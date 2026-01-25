-- 引換券をコインに変換する関数
-- パラメータ:
--   p_user_id: DiscordユーザーID (text)
--   p_rarity: 引換券のレアリティ名 (text)
--   p_amount: 換金する枚数 (int)

CREATE OR REPLACE FUNCTION public.convert_exchange_ticket(p_user_id text, p_rarity text, p_amount int)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_profile RECORD;
    v_current_tickets jsonb;
    v_current_count int;
    v_rate int;
    v_total_price int;
    v_new_tickets jsonb;
BEGIN
    -- 1. バリデーション
    IF p_amount <= 0 THEN
        RETURN json_build_object('ok', false, 'error', '枚数は1枚以上指定してください');
    END IF;

    -- 2. レート設定
    CASE p_rarity
        WHEN '一般' THEN v_rate := 25;
        WHEN '良質' THEN v_rate := 60;
        WHEN '希少・Ⅰ' THEN v_rate := 85;
        WHEN '希少・Ⅱ' THEN v_rate := 150;
        WHEN '貴重' THEN v_rate := 250;
        WHEN '特上' THEN v_rate := 350;
        WHEN '極上' THEN v_rate := 500;
        ELSE
            RETURN json_build_object('ok', false, 'error', '未対応の引換券種別です: ' || p_rarity);
    END CASE;

    v_total_price := v_rate * p_amount;

    -- 3. ユーザー情報のロック取得
    SELECT * INTO v_profile 
    FROM public.profiles 
    WHERE discord_user_id = p_user_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('ok', false, 'error', 'ユーザーが見つかりません');
    END IF;

    -- 4. 所持数チェック
    v_current_tickets := v_profile.exchange_tickets;
    IF v_current_tickets IS NULL THEN
        v_current_tickets := '{}'::jsonb;
    END IF;

    -- JSONBから数値として取得 (存在しない場合はNULLになるのでCOALESCEで0にする)
    v_current_count := COALESCE((v_current_tickets ->> p_rarity)::int, 0);

    IF v_current_count < p_amount THEN
        RETURN json_build_object('ok', false, 'error', '引換券が不足しています (所持: ' || v_current_count || '枚)');
    END IF;

    -- 5. データ更新
    -- 引換券を減らす
    v_new_tickets := jsonb_set(
        v_current_tickets, 
        array[p_rarity], 
        to_jsonb(v_current_count - p_amount)
    );

    -- コインと総資産を加算 & チケット更新
    UPDATE public.profiles
    SET 
        coins = coins + v_total_price,
        total_assets = total_assets + v_total_price,
        exchange_tickets = v_new_tickets
    WHERE discord_user_id = p_user_id;

    -- 6. 活動ログ記録
    INSERT INTO public.activity_logs (
        user_id,
        action_type,
        amount,
        details
    ) VALUES (
        p_user_id,
        'ticket_exchange',
        v_total_price,
        json_build_object(
            'rarity', p_rarity,
            'count', p_amount,
            'rate', v_rate,
            'total_price', v_total_price
        )
    );

    -- 成功レスポンス
    RETURN json_build_object(
        'ok', true,
        'message', p_rarity || '引換券 ' || p_amount || '枚を ' || v_total_price || 'コインに換金しました',
        'coins', v_profile.coins + v_total_price,
        'new_ticket_count', v_current_count - p_amount
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'error', SQLERRM);
END;
$function$;

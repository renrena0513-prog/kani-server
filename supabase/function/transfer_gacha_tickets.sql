CREATE OR REPLACE FUNCTION public.transfer_gacha_tickets(p_from_id text, p_to_id text, p_amount integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- 送信元の残高チェック
    IF (SELECT gacha_tickets FROM profiles WHERE discord_user_id = p_from_id) < p_amount THEN
        RETURN jsonb_build_object('ok', false, 'error', '祈願符が不足しています');
    END IF;
    -- 譲渡処理
    UPDATE profiles SET gacha_tickets = gacha_tickets - p_amount WHERE discord_user_id = p_from_id;
    UPDATE profiles SET gacha_tickets = COALESCE(gacha_tickets, 0) + p_amount WHERE discord_user_id = p_to_id;
    RETURN jsonb_build_object('ok', true);
END;
$function$;

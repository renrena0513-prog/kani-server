CREATE OR REPLACE FUNCTION public.transfer_exchange_tickets(p_from_id text, p_to_id text, p_rarity text, p_amount integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_from_tickets jsonb;
    v_to_tickets jsonb;
    v_current_count INTEGER;
BEGIN
    -- 送信元の情報を取得
    SELECT exchange_tickets INTO v_from_tickets FROM profiles WHERE discord_user_id = p_from_id;
    
    -- 現在の所持数確認
    v_current_count := COALESCE((v_from_tickets->>p_rarity)::INTEGER, 0);
    
    IF v_current_count < p_amount THEN
        RETURN jsonb_build_object('ok', false, 'error', '引換券が不足しています');
    END IF;
    -- 送信元の減算
    v_from_tickets := v_from_tickets || jsonb_build_object(p_rarity, v_current_count - p_amount);
    -- 0枚になったらキーを削除
    IF (v_from_tickets->>p_rarity)::INTEGER = 0 THEN
        v_from_tickets := v_from_tickets - p_rarity;
    END IF;
    -- 受信元の情報を取得
    SELECT exchange_tickets INTO v_to_tickets FROM profiles WHERE discord_user_id = p_to_id;
    v_to_tickets := COALESCE(v_to_tickets, '{}'::jsonb) || 
                    jsonb_build_object(p_rarity, COALESCE((v_to_tickets->>p_rarity)::INTEGER, 0) + p_amount);
    -- 更新
    UPDATE profiles SET exchange_tickets = v_from_tickets WHERE discord_user_id = p_from_id;
    UPDATE profiles SET exchange_tickets = v_to_tickets WHERE discord_user_id = p_to_id;
    RETURN jsonb_build_object('ok', true);
END;
$function$;

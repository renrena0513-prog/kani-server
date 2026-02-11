CREATE OR REPLACE FUNCTION public.transfer_coins(p_amount integer, p_from_id text, p_to_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_from_coins Int;
BEGIN
    -- 1. 送り主の残高チェック
    SELECT coins INTO v_from_coins FROM profiles WHERE discord_user_id = p_from_id;
    IF v_from_coins < p_amount THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Insufficient coins');
    END IF;

    -- 2. トランザクション
    UPDATE profiles SET coins = coins - p_amount WHERE discord_user_id = p_from_id;
    UPDATE profiles SET coins = coins + p_amount, total_assets = total_assets + p_amount WHERE discord_user_id = p_to_id;

    RETURN jsonb_build_object('ok', true);
END;
$function$;

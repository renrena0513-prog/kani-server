CREATE OR REPLACE FUNCTION public.poker_bet_cancel_single(p_bet_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_bet RECORD;
    v_event RECORD;
BEGIN
    IF is_admin() IS NOT TRUE THEN
        RETURN jsonb_build_object('ok', false, 'error', '管理者のみ実行できます');
    END IF;

    SELECT * INTO v_bet FROM poker_finals_bets WHERE id = p_bet_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', '賭けが見つかりません');
    END IF;

    SELECT * INTO v_event FROM poker_finals_predictions WHERE id = v_bet.event_id FOR UPDATE;
    IF NOT FOUND OR v_event.status <> 'open' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'このイベントの賭けは取り消せません');
    END IF;

    UPDATE profiles SET coins = coins + v_bet.amount WHERE discord_user_id = v_bet.discord_user_id;
    DELETE FROM poker_finals_bets WHERE id = p_bet_id;

    RETURN jsonb_build_object('ok', true, 'refund_amount', v_bet.amount, 'discord_user_id', v_bet.discord_user_id);
END;
$function$;

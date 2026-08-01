CREATE OR REPLACE FUNCTION public.poker_bet_cancel_event(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_event RECORD;
    v_admin_id text;
    v_bet RECORD;
    v_refunded int := 0;
    v_total_refund bigint := 0;
BEGIN
    IF NOT is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', '管理者のみ実行できます');
    END IF;
    v_admin_id := auth.jwt() -> 'user_metadata' ->> 'provider_id';

    SELECT * INTO v_event FROM poker_finals_predictions WHERE id = p_event_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'イベントが見つかりません');
    END IF;
    IF v_event.status <> 'open' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'このイベントは既に確定または中止されています');
    END IF;

    FOR v_bet IN SELECT * FROM poker_finals_bets WHERE event_id = p_event_id LOOP
        UPDATE profiles SET coins = coins + v_bet.amount WHERE discord_user_id = v_bet.discord_user_id;
        v_refunded := v_refunded + 1;
        v_total_refund := v_total_refund + v_bet.amount;
    END LOOP;

    UPDATE poker_finals_predictions
        SET status = 'cancelled', settled_at = now(), settled_by = v_admin_id
        WHERE id = p_event_id;

    RETURN jsonb_build_object('ok', true, 'refunded', v_refunded, 'total_refund', v_total_refund);
END;
$function$;

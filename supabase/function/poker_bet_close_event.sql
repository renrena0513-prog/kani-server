CREATE OR REPLACE FUNCTION public.poker_bet_close_event(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_event RECORD;
BEGIN
    IF is_admin() IS NOT TRUE THEN
        RETURN jsonb_build_object('ok', false, 'error', '管理者のみ実行できます');
    END IF;

    SELECT * INTO v_event FROM poker_finals_predictions WHERE id = p_event_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'イベントが見つかりません');
    END IF;
    IF v_event.status <> 'open' THEN
        RETURN jsonb_build_object('ok', false, 'error', '開催中のイベントのみ締め切ることができます');
    END IF;

    UPDATE poker_finals_predictions SET status = 'closed' WHERE id = p_event_id;

    RETURN jsonb_build_object('ok', true);
END;
$function$;

DROP FUNCTION IF EXISTS public.poker_bet_settle(uuid, text);

CREATE OR REPLACE FUNCTION public.poker_bet_settle(p_event_id uuid, p_result_order jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_event RECORD;
    v_admin_id text;
    v_bet RECORD;
    v_payout int;
    v_winners int := 0;
    v_total_payout bigint := 0;
    v_result_names text[];
    v_team_names text[];
    v_result_sorted text[];
    v_sel_sorted text[];
    v_won boolean;
BEGIN
    IF is_admin() IS NOT TRUE THEN
        RETURN jsonb_build_object('ok', false, 'error', '管理者のみ実行できます');
    END IF;
    v_admin_id := auth.jwt() -> 'user_metadata' ->> 'provider_id';

    SELECT * INTO v_event FROM poker_finals_predictions WHERE id = p_event_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'イベントが見つかりません');
    END IF;
    IF v_event.status <> 'open' THEN
        RETURN jsonb_build_object('ok', false, 'error', '既に結果が確定しています');
    END IF;

    IF jsonb_array_length(p_result_order) <> 3 THEN
        RETURN jsonb_build_object('ok', false, 'error', '1位・2位・3位の3チームを指定してください');
    END IF;

    v_result_names := ARRAY(SELECT jsonb_array_elements_text(p_result_order));
    v_team_names := ARRAY(SELECT t->>'team_name' FROM jsonb_array_elements(v_event.teams) t);

    IF (SELECT count(DISTINCT x) FROM unnest(v_result_names) x) <> 3 THEN
        RETURN jsonb_build_object('ok', false, 'error', '同じチームが複数指定されています');
    END IF;
    IF NOT (v_result_names <@ v_team_names) THEN
        RETURN jsonb_build_object('ok', false, 'error', '無効なチームです');
    END IF;

    v_result_sorted := ARRAY(SELECT unnest(v_result_names) ORDER BY 1);

    FOR v_bet IN SELECT * FROM poker_finals_bets WHERE event_id = p_event_id LOOP
        IF v_bet.bet_type = 'win' THEN
            v_won := (v_bet.selection->>0) = v_result_names[1];
        ELSIF v_bet.bet_type = 'place' THEN
            v_won := (v_bet.selection->>0) = ANY(v_result_names);
        ELSIF v_bet.bet_type = 'trifecta' THEN
            v_won := (v_bet.selection = p_result_order);
        ELSE -- trio
            v_sel_sorted := ARRAY(SELECT jsonb_array_elements_text(v_bet.selection) ORDER BY 1);
            v_won := (v_sel_sorted = v_result_sorted);
        END IF;

        IF v_won THEN
            v_payout := round(v_bet.amount * v_bet.odds);
            UPDATE profiles SET coins = coins + v_payout, total_assets = total_assets + v_payout
                WHERE discord_user_id = v_bet.discord_user_id;
            v_winners := v_winners + 1;
            v_total_payout := v_total_payout + v_payout;
        ELSE
            v_payout := 0;
        END IF;
        UPDATE poker_finals_bets SET payout = v_payout WHERE id = v_bet.id;
    END LOOP;

    UPDATE poker_finals_predictions
        SET status = 'settled', result_order = p_result_order, winner_team_name = v_result_names[1],
            settled_at = now(), settled_by = v_admin_id
        WHERE id = p_event_id;

    RETURN jsonb_build_object('ok', true, 'winners', v_winners, 'total_payout', v_total_payout);
END;
$function$;

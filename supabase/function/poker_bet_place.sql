CREATE OR REPLACE FUNCTION public.poker_bet_place(p_discord_user_id text, p_event_id uuid, p_team_name text, p_amount integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_event RECORD;
    v_coins int;
    v_odds numeric;
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', '金額は1以上を指定してください');
    END IF;

    SELECT * INTO v_event FROM poker_finals_predictions WHERE id = p_event_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', '予想イベントが見つかりません');
    END IF;
    IF v_event.status <> 'open' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'このイベントは受付終了しています');
    END IF;

    SELECT (t->>'odds')::numeric INTO v_odds
    FROM jsonb_array_elements(v_event.teams) t
    WHERE t->>'team_name' = p_team_name;

    IF v_odds IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', '無効なチームです');
    END IF;

    IF EXISTS (SELECT 1 FROM poker_finals_bets WHERE event_id = p_event_id AND discord_user_id = p_discord_user_id) THEN
        RETURN jsonb_build_object('ok', false, 'error', '既にこのイベントに賭けています');
    END IF;

    SELECT coins INTO v_coins FROM profiles WHERE discord_user_id = p_discord_user_id FOR UPDATE;
    IF v_coins IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'プロフィールが見つかりません');
    END IF;
    IF v_coins < p_amount THEN
        RETURN jsonb_build_object('ok', false, 'error', 'マネーが不足しています');
    END IF;

    UPDATE profiles SET coins = coins - p_amount WHERE discord_user_id = p_discord_user_id;

    INSERT INTO poker_finals_bets (event_id, discord_user_id, team_name, odds, amount)
    VALUES (p_event_id, p_discord_user_id, p_team_name, v_odds, p_amount);

    RETURN jsonb_build_object('ok', true, 'odds', v_odds);
END;
$function$;

CREATE OR REPLACE FUNCTION public.poker_bet_place(p_discord_user_id text, p_event_id uuid, p_bet_type text, p_selection jsonb, p_amount integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_event RECORD;
    v_coins int;
    v_odds numeric;
    v_sel_len int;
    v_sel_names text[];
    v_team_names text[];
    v_sorted_sel text[];
    v_existing_sum bigint;
BEGIN
    IF p_amount IS NULL OR p_amount < 1000 OR p_amount % 1000 <> 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', '金額は1000単位で入力してください');
    END IF;
    IF p_bet_type NOT IN ('win', 'place', 'exacta', 'quinella', 'trio', 'trifecta') THEN
        RETURN jsonb_build_object('ok', false, 'error', '無効な賭式です');
    END IF;

    SELECT * INTO v_event FROM poker_finals_predictions WHERE id = p_event_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', '予想イベントが見つかりません');
    END IF;
    IF v_event.status <> 'open' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'このイベントは受付終了しています');
    END IF;

    v_sel_len := jsonb_array_length(p_selection);
    v_sel_names := ARRAY(SELECT jsonb_array_elements_text(p_selection));
    v_team_names := ARRAY(SELECT t->>'team_name' FROM jsonb_array_elements(v_event.teams) t);

    IF (SELECT count(DISTINCT x) FROM unnest(v_sel_names) x) <> v_sel_len THEN
        RETURN jsonb_build_object('ok', false, 'error', '選択したチームが重複しています');
    END IF;
    IF NOT (v_sel_names <@ v_team_names) THEN
        RETURN jsonb_build_object('ok', false, 'error', '無効なチームです');
    END IF;

    IF p_bet_type = 'win' THEN
        IF v_sel_len <> 1 THEN
            RETURN jsonb_build_object('ok', false, 'error', '単勝は1チーム選択してください');
        END IF;
        SELECT (t->>'odds')::numeric INTO v_odds
        FROM jsonb_array_elements(v_event.teams) t
        WHERE t->>'team_name' = v_sel_names[1];

    ELSIF p_bet_type = 'place' THEN
        IF v_sel_len <> 1 THEN
            RETURN jsonb_build_object('ok', false, 'error', '複勝は1チーム選択してください');
        END IF;
        SELECT (e->>'odds')::numeric INTO v_odds
        FROM jsonb_array_elements(v_event.place_odds) e
        WHERE e->>'team_name' = v_sel_names[1];

    ELSIF p_bet_type = 'exacta' THEN
        IF v_sel_len <> 2 THEN
            RETURN jsonb_build_object('ok', false, 'error', '二連単は2チーム選択してください');
        END IF;
        SELECT (e->>'odds')::numeric INTO v_odds
        FROM jsonb_array_elements(v_event.exacta_odds) e
        WHERE e->'teams' = p_selection;

    ELSIF p_bet_type = 'quinella' THEN
        IF v_sel_len <> 2 THEN
            RETURN jsonb_build_object('ok', false, 'error', '二連複は2チーム選択してください');
        END IF;
        v_sorted_sel := ARRAY(SELECT unnest(v_sel_names) ORDER BY 1);
        p_selection := to_jsonb(v_sorted_sel);
        SELECT (e->>'odds')::numeric INTO v_odds
        FROM jsonb_array_elements(v_event.quinella_odds) e
        WHERE e->'teams' = p_selection;

    ELSIF p_bet_type = 'trifecta' THEN
        IF v_sel_len <> 3 THEN
            RETURN jsonb_build_object('ok', false, 'error', '三連単は3チーム選択してください');
        END IF;
        SELECT (e->>'odds')::numeric INTO v_odds
        FROM jsonb_array_elements(v_event.trifecta_odds) e
        WHERE e->'teams' = p_selection;

    ELSE -- trio
        IF v_sel_len <> 3 THEN
            RETURN jsonb_build_object('ok', false, 'error', '三連複は3チーム選択してください');
        END IF;
        v_sorted_sel := ARRAY(SELECT unnest(v_sel_names) ORDER BY 1);
        p_selection := to_jsonb(v_sorted_sel);
        SELECT (e->>'odds')::numeric INTO v_odds
        FROM jsonb_array_elements(v_event.trio_odds) e
        WHERE e->'teams' = p_selection;
    END IF;

    IF v_odds IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', '無効な選択です');
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_existing_sum
    FROM poker_finals_bets
    WHERE event_id = p_event_id AND discord_user_id = p_discord_user_id
      AND bet_type = p_bet_type AND selection = p_selection;
    IF v_existing_sum + p_amount > 50000 THEN
        RETURN jsonb_build_object('ok', false, 'error',
            '同じ賭け方への合計ベット額は50,000マネーまでです（現在の合計: ' || v_existing_sum::text || 'マネー）');
    END IF;

    SELECT coins INTO v_coins FROM profiles WHERE discord_user_id = p_discord_user_id FOR UPDATE;
    IF v_coins IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'プロフィールが見つかりません');
    END IF;
    IF v_coins < p_amount THEN
        RETURN jsonb_build_object('ok', false, 'error', 'マネーが不足しています');
    END IF;

    UPDATE profiles SET coins = coins - p_amount WHERE discord_user_id = p_discord_user_id;

    INSERT INTO poker_finals_bets (event_id, discord_user_id, bet_type, selection, odds, amount)
    VALUES (p_event_id, p_discord_user_id, p_bet_type, p_selection, v_odds, p_amount);

    RETURN jsonb_build_object('ok', true, 'odds', v_odds);
END;
$function$;

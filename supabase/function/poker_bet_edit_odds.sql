CREATE OR REPLACE FUNCTION public.poker_bet_edit_odds(p_event_id uuid, p_teams jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_event RECORD;
    v_count int;
    v_team jsonb;
    v_names text[];
    v_existing_names text[];
    v_odds numeric[];
    v_strength numeric[];
    v_total numeric := 0;
    v_n int;
    i int; j int; k int;
    v_p numeric;
    v_raw_odds numeric;
    v_trifecta jsonb := '[]'::jsonb;
    v_trio jsonb := '[]'::jsonb;
    v_place jsonb := '[]'::jsonb;
    v_exacta jsonb := '[]'::jsonb;
    v_quinella jsonb := '[]'::jsonb;
    v_trio_names text[];
    v_quinella_names text[];
    v_place_prob numeric[];
    v_p2 numeric;
BEGIN
    IF is_admin() IS NOT TRUE THEN
        RETURN jsonb_build_object('ok', false, 'error', '管理者のみ実行できます');
    END IF;

    SELECT * INTO v_event FROM poker_finals_predictions WHERE id = p_event_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'イベントが見つかりません');
    END IF;
    IF v_event.status <> 'open' THEN
        RETURN jsonb_build_object('ok', false, 'error', '開催中のイベントのみオッズを編集できます');
    END IF;

    SELECT jsonb_array_length(p_teams) INTO v_count;
    v_names := ARRAY(SELECT t->>'team_name' FROM jsonb_array_elements(p_teams) t);
    v_existing_names := ARRAY(SELECT t->>'team_name' FROM jsonb_array_elements(v_event.teams) t);

    IF v_count IS NULL OR v_count <> array_length(v_existing_names, 1) THEN
        RETURN jsonb_build_object('ok', false, 'error', '参加チーム数を変更することはできません');
    END IF;
    IF (SELECT count(DISTINCT x) FROM unnest(v_names) x) <> v_count THEN
        RETURN jsonb_build_object('ok', false, 'error', 'チーム名が重複しています');
    END IF;
    IF NOT (v_names @> v_existing_names AND v_existing_names @> v_names) THEN
        RETURN jsonb_build_object('ok', false, 'error', '参加チームの変更はできません（オッズのみ編集可能です）');
    END IF;

    FOR v_team IN SELECT * FROM jsonb_array_elements(p_teams) LOOP
        IF (v_team->>'odds') IS NULL OR (v_team->>'odds')::numeric <= 0 THEN
            RETURN jsonb_build_object('ok', false, 'error', 'オッズは0より大きい値を指定してください');
        END IF;
    END LOOP;

    v_n := v_count;
    v_odds := ARRAY(SELECT (t->>'odds')::numeric FROM jsonb_array_elements(p_teams) t);
    v_strength := ARRAY(SELECT 1 / o FROM unnest(v_odds) o);
    SELECT sum(s) INTO v_total FROM unnest(v_strength) s;

    -- 三連単（全順列）※ イベント開催時にスナップショットした払戻率・オッズ上下限を使う
    FOR i IN 1..v_n LOOP
        FOR j IN 1..v_n LOOP
            IF j = i THEN CONTINUE; END IF;
            FOR k IN 1..v_n LOOP
                IF k = i OR k = j THEN CONTINUE; END IF;
                v_p := _poker_perm_prob(v_strength[i], v_strength[j], v_strength[k], v_total);
                IF v_p > 0 THEN
                    v_raw_odds := round(LEAST(GREATEST(v_event.payout_rate / v_p, v_event.min_odds), v_event.max_odds), 1);
                ELSE
                    v_raw_odds := v_event.max_odds;
                END IF;
                v_trifecta := v_trifecta || jsonb_build_object(
                    'teams', jsonb_build_array(v_names[i], v_names[j], v_names[k]),
                    'odds', v_raw_odds
                );
            END LOOP;
        END LOOP;
    END LOOP;

    -- 三連複
    FOR i IN 1..v_n LOOP
        FOR j IN i+1..v_n LOOP
            FOR k IN j+1..v_n LOOP
                v_p := _poker_perm_prob(v_strength[i], v_strength[j], v_strength[k], v_total)
                     + _poker_perm_prob(v_strength[i], v_strength[k], v_strength[j], v_total)
                     + _poker_perm_prob(v_strength[j], v_strength[i], v_strength[k], v_total)
                     + _poker_perm_prob(v_strength[j], v_strength[k], v_strength[i], v_total)
                     + _poker_perm_prob(v_strength[k], v_strength[i], v_strength[j], v_total)
                     + _poker_perm_prob(v_strength[k], v_strength[j], v_strength[i], v_total);
                IF v_p > 0 THEN
                    v_raw_odds := round(LEAST(GREATEST(v_event.payout_rate / v_p, v_event.min_odds), v_event.max_odds), 1);
                ELSE
                    v_raw_odds := v_event.max_odds;
                END IF;
                v_trio_names := ARRAY(SELECT unnest(ARRAY[v_names[i], v_names[j], v_names[k]]) ORDER BY 1);
                v_trio := v_trio || jsonb_build_object(
                    'teams', to_jsonb(v_trio_names),
                    'odds', v_raw_odds
                );
            END LOOP;
        END LOOP;
    END LOOP;

    -- 二連単（1・2着の全順列）
    FOR i IN 1..v_n LOOP
        FOR j IN 1..v_n LOOP
            IF j = i THEN CONTINUE; END IF;
            v_p2 := (v_strength[i] / v_total) * (v_strength[j] / (v_total - v_strength[i]));
            IF v_p2 > 0 THEN
                v_raw_odds := round(LEAST(GREATEST(v_event.payout_rate / v_p2, v_event.min_odds), v_event.max_odds), 1);
            ELSE
                v_raw_odds := v_event.max_odds;
            END IF;
            v_exacta := v_exacta || jsonb_build_object(
                'teams', jsonb_build_array(v_names[i], v_names[j]),
                'odds', v_raw_odds
            );
        END LOOP;
    END LOOP;

    -- 二連複（1・2着に入る2チーム、組み合わせ）
    FOR i IN 1..v_n LOOP
        FOR j IN i+1..v_n LOOP
            v_p2 := (v_strength[i] / v_total) * (v_strength[j] / (v_total - v_strength[i]))
                  + (v_strength[j] / v_total) * (v_strength[i] / (v_total - v_strength[j]));
            IF v_p2 > 0 THEN
                v_raw_odds := round(LEAST(GREATEST(v_event.payout_rate / v_p2, v_event.min_odds), v_event.max_odds), 1);
            ELSE
                v_raw_odds := v_event.max_odds;
            END IF;
            v_quinella_names := ARRAY(SELECT unnest(ARRAY[v_names[i], v_names[j]]) ORDER BY 1);
            v_quinella := v_quinella || jsonb_build_object(
                'teams', to_jsonb(v_quinella_names),
                'odds', v_raw_odds
            );
        END LOOP;
    END LOOP;

    -- 複勝
    v_place_prob := array_fill(0::numeric, ARRAY[v_n]);
    FOR i IN 1..v_n LOOP
        v_place_prob[i] := v_strength[i] / v_total;
    END LOOP;
    FOR i IN 1..v_n LOOP
        FOR j IN 1..v_n LOOP
            IF j = i THEN CONTINUE; END IF;
            v_place_prob[i] := v_place_prob[i] + (v_strength[j] / v_total) * (v_strength[i] / (v_total - v_strength[j]));
        END LOOP;
    END LOOP;
    FOR i IN 1..v_n LOOP
        FOR j IN 1..v_n LOOP
            IF j = i THEN CONTINUE; END IF;
            FOR k IN 1..v_n LOOP
                IF k = i OR k = j THEN CONTINUE; END IF;
                v_place_prob[i] := v_place_prob[i] + _poker_perm_prob(v_strength[j], v_strength[k], v_strength[i], v_total);
            END LOOP;
        END LOOP;
    END LOOP;
    FOR i IN 1..v_n LOOP
        IF v_place_prob[i] > 0 THEN
            v_raw_odds := round(LEAST(GREATEST(v_event.payout_rate / v_place_prob[i], v_event.min_odds), v_event.max_odds), 1);
        ELSE
            v_raw_odds := v_event.max_odds;
        END IF;
        v_place := v_place || jsonb_build_object('team_name', v_names[i], 'odds', v_raw_odds);
    END LOOP;

    -- 既に成立している賭けのオッズ(poker_finals_bets.odds)は据え置き（後出しで有利/不利にしない）
    UPDATE poker_finals_predictions
        SET teams = p_teams, trio_odds = v_trio, trifecta_odds = v_trifecta, place_odds = v_place,
            exacta_odds = v_exacta, quinella_odds = v_quinella
        WHERE id = p_event_id;

    RETURN jsonb_build_object('ok', true);
END;
$function$;

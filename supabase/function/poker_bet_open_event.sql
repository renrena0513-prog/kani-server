CREATE OR REPLACE FUNCTION public.poker_bet_open_event(p_teams jsonb, p_title text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_admin_id text;
    v_event_id uuid;
    v_count int;
    v_team jsonb;
    v_settings RECORD;
    v_names text[];
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
    v_trio_names text[];
    v_place_prob numeric[];
BEGIN
    IF NOT is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', '管理者のみ実行できます');
    END IF;
    v_admin_id := auth.jwt() -> 'user_metadata' ->> 'provider_id';

    IF EXISTS (SELECT 1 FROM poker_finals_predictions WHERE status = 'open') THEN
        RETURN jsonb_build_object('ok', false, 'error', '既に開催中の予想があります');
    END IF;

    SELECT jsonb_array_length(p_teams) INTO v_count;
    IF v_count IS NULL OR v_count < 3 THEN
        RETURN jsonb_build_object('ok', false, 'error', '三連複・三連単の生成には3チーム以上が必要です');
    END IF;

    v_names := ARRAY(SELECT t->>'team_name' FROM jsonb_array_elements(p_teams) t);
    IF (SELECT count(DISTINCT x) FROM unnest(v_names) x) <> v_count THEN
        RETURN jsonb_build_object('ok', false, 'error', 'チーム名が重複しています');
    END IF;

    FOR v_team IN SELECT * FROM jsonb_array_elements(p_teams) LOOP
        IF NULLIF(trim(v_team->>'team_name'), '') IS NULL THEN
            RETURN jsonb_build_object('ok', false, 'error', 'チーム名が空です');
        END IF;
        IF (v_team->>'odds') IS NULL OR (v_team->>'odds')::numeric <= 0 THEN
            RETURN jsonb_build_object('ok', false, 'error', 'オッズは0より大きい値を指定してください');
        END IF;
    END LOOP;

    SELECT * INTO v_settings FROM poker_betting_settings WHERE id = 1;

    v_n := v_count;
    v_odds := ARRAY(SELECT (t->>'odds')::numeric FROM jsonb_array_elements(p_teams) t);
    v_strength := ARRAY(SELECT 1 / o FROM unnest(v_odds) o);
    SELECT sum(s) INTO v_total FROM unnest(v_strength) s;

    -- 三連単（全順列）
    FOR i IN 1..v_n LOOP
        FOR j IN 1..v_n LOOP
            IF j = i THEN CONTINUE; END IF;
            FOR k IN 1..v_n LOOP
                IF k = i OR k = j THEN CONTINUE; END IF;
                v_p := _poker_perm_prob(v_strength[i], v_strength[j], v_strength[k], v_total);
                IF v_p > 0 THEN
                    v_raw_odds := round(LEAST(GREATEST(v_settings.payout_rate / v_p, v_settings.min_odds), v_settings.max_odds), 1);
                ELSE
                    v_raw_odds := v_settings.max_odds;
                END IF;
                v_trifecta := v_trifecta || jsonb_build_object(
                    'teams', jsonb_build_array(v_names[i], v_names[j], v_names[k]),
                    'odds', v_raw_odds
                );
            END LOOP;
        END LOOP;
    END LOOP;

    -- 三連複（組み合わせ、チーム名を昇順に格納。的中判定はセット比較のため）
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
                    v_raw_odds := round(LEAST(GREATEST(v_settings.payout_rate / v_p, v_settings.min_odds), v_settings.max_odds), 1);
                ELSE
                    v_raw_odds := v_settings.max_odds;
                END IF;
                v_trio_names := ARRAY(SELECT unnest(ARRAY[v_names[i], v_names[j], v_names[k]]) ORDER BY 1);
                v_trio := v_trio || jsonb_build_object(
                    'teams', to_jsonb(v_trio_names),
                    'odds', v_raw_odds
                );
            END LOOP;
        END LOOP;
    END LOOP;

    -- 複勝（各チームが3着以内に入る確率 = 1着+2着+3着の周辺確率）
    v_place_prob := array_fill(0::numeric, ARRAY[v_n]);
    FOR i IN 1..v_n LOOP
        v_place_prob[i] := v_strength[i] / v_total; -- P(i=1着)
    END LOOP;
    FOR i IN 1..v_n LOOP
        FOR j IN 1..v_n LOOP -- P(i=2着): j=1着
            IF j = i THEN CONTINUE; END IF;
            v_place_prob[i] := v_place_prob[i] + (v_strength[j] / v_total) * (v_strength[i] / (v_total - v_strength[j]));
        END LOOP;
    END LOOP;
    FOR i IN 1..v_n LOOP
        FOR j IN 1..v_n LOOP -- P(i=3着): j,k=1着,2着
            IF j = i THEN CONTINUE; END IF;
            FOR k IN 1..v_n LOOP
                IF k = i OR k = j THEN CONTINUE; END IF;
                v_place_prob[i] := v_place_prob[i] + _poker_perm_prob(v_strength[j], v_strength[k], v_strength[i], v_total);
            END LOOP;
        END LOOP;
    END LOOP;
    FOR i IN 1..v_n LOOP
        IF v_place_prob[i] > 0 THEN
            v_raw_odds := round(LEAST(GREATEST(v_settings.payout_rate / v_place_prob[i], v_settings.min_odds), v_settings.max_odds), 1);
        ELSE
            v_raw_odds := v_settings.max_odds;
        END IF;
        v_place := v_place || jsonb_build_object('team_name', v_names[i], 'odds', v_raw_odds);
    END LOOP;

    INSERT INTO poker_finals_predictions
        (title, status, teams, trio_odds, trifecta_odds, place_odds, created_by, payout_rate, min_odds, max_odds)
    VALUES
        (COALESCE(NULLIF(trim(p_title), ''), '決勝卓予想'), 'open', p_teams, v_trio, v_trifecta, v_place, v_admin_id,
         v_settings.payout_rate, v_settings.min_odds, v_settings.max_odds)
    RETURNING id INTO v_event_id;

    RETURN jsonb_build_object('ok', true, 'event_id', v_event_id);
END;
$function$;

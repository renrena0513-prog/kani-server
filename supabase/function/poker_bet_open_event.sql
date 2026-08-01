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
BEGIN
    IF NOT is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', '管理者のみ実行できます');
    END IF;
    v_admin_id := auth.jwt() -> 'user_metadata' ->> 'provider_id';

    IF EXISTS (SELECT 1 FROM poker_finals_predictions WHERE status = 'open') THEN
        RETURN jsonb_build_object('ok', false, 'error', '既に開催中の予想があります');
    END IF;

    SELECT jsonb_array_length(p_teams) INTO v_count;
    IF v_count IS NULL OR v_count < 2 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'チームは2つ以上指定してください');
    END IF;

    FOR v_team IN SELECT * FROM jsonb_array_elements(p_teams) LOOP
        IF NULLIF(trim(v_team->>'team_name'), '') IS NULL THEN
            RETURN jsonb_build_object('ok', false, 'error', 'チーム名が空です');
        END IF;
        IF (v_team->>'odds') IS NULL OR (v_team->>'odds')::numeric <= 0 THEN
            RETURN jsonb_build_object('ok', false, 'error', 'オッズは0より大きい値を指定してください');
        END IF;
    END LOOP;

    INSERT INTO poker_finals_predictions (title, status, teams, created_by)
    VALUES (COALESCE(NULLIF(trim(p_title), ''), '決勝卓予想'), 'open', p_teams, v_admin_id)
    RETURNING id INTO v_event_id;

    RETURN jsonb_build_object('ok', true, 'event_id', v_event_id);
END;
$function$;

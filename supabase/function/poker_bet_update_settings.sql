CREATE OR REPLACE FUNCTION public.poker_bet_update_settings(p_payout_rate numeric, p_min_odds numeric, p_max_odds numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_admin_id text;
BEGIN
    IF is_admin() IS NOT TRUE THEN
        RETURN jsonb_build_object('ok', false, 'error', '管理者のみ実行できます');
    END IF;
    v_admin_id := auth.jwt() -> 'user_metadata' ->> 'provider_id';

    IF p_payout_rate IS NULL OR p_payout_rate <= 0 OR p_payout_rate > 1 THEN
        RETURN jsonb_build_object('ok', false, 'error', '払戻率は0〜1の範囲で指定してください');
    END IF;
    IF p_min_odds IS NULL OR p_min_odds < 1 THEN
        RETURN jsonb_build_object('ok', false, 'error', '最低オッズは1以上を指定してください');
    END IF;
    IF p_max_odds IS NULL OR p_max_odds <= p_min_odds THEN
        RETURN jsonb_build_object('ok', false, 'error', '最高オッズは最低オッズより大きい値を指定してください');
    END IF;

    UPDATE poker_betting_settings
        SET payout_rate = p_payout_rate, min_odds = p_min_odds, max_odds = p_max_odds,
            updated_at = now(), updated_by = v_admin_id
        WHERE id = 1;

    RETURN jsonb_build_object('ok', true);
END;
$function$;

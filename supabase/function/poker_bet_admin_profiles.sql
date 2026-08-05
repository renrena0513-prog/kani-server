CREATE OR REPLACE FUNCTION public.poker_bet_admin_profiles(p_discord_user_ids text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_result jsonb;
BEGIN
    IF is_admin() IS NOT TRUE THEN
        RETURN '[]'::jsonb;
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'discord_user_id', discord_user_id,
        'account_name', account_name,
        'avatar_url', avatar_url
    )), '[]'::jsonb)
    INTO v_result
    FROM profiles
    WHERE discord_user_id = ANY(p_discord_user_ids);

    RETURN v_result;
END;
$function$;

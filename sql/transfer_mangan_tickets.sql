CREATE OR REPLACE FUNCTION public.transfer_mangan_tickets(p_from_id text, p_to_id text, p_amount integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_from integer;
    v_to integer;
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN json_build_object('ok', false, 'error', 'invalid_amount');
    END IF;

    SELECT mangan_tickets INTO v_from
    FROM public.profiles
    WHERE discord_user_id = p_from_id
    FOR UPDATE;

    IF v_from IS NULL OR v_from < p_amount THEN
        RETURN json_build_object('ok', false, 'error', 'insufficient');
    END IF;

    UPDATE public.profiles
    SET mangan_tickets = v_from - p_amount
    WHERE discord_user_id = p_from_id;

    SELECT mangan_tickets INTO v_to
    FROM public.profiles
    WHERE discord_user_id = p_to_id
    FOR UPDATE;

    IF v_to IS NULL THEN
        RETURN json_build_object('ok', false, 'error', 'target_not_found');
    END IF;

    UPDATE public.profiles
    SET mangan_tickets = v_to + p_amount
    WHERE discord_user_id = p_to_id;

    RETURN json_build_object('ok', true);
END;
$function$;

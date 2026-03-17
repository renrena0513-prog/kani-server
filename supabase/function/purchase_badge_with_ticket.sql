CREATE OR REPLACE FUNCTION public.purchase_badge_with_ticket(p_user_id text, p_badge_id uuid, p_ticket_rarity text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_tickets jsonb;
    v_current_count integer;
    v_is_mutant boolean;
BEGIN
    -- 現在の引換券を取得
    SELECT COALESCE(exchange_tickets, '{}'::jsonb) INTO v_tickets
    FROM profiles WHERE discord_user_id = p_user_id;
    
    v_current_count := COALESCE((v_tickets ->> p_ticket_rarity)::integer, 0);
    
    IF v_current_count < 1 THEN
        RETURN jsonb_build_object('ok', false, 'error', '引換券が不足しています');
    END IF;
    
    -- 引換券を1枚消費
    v_tickets := jsonb_set(v_tickets, ARRAY[p_ticket_rarity], to_jsonb(v_current_count - 1));
    UPDATE profiles SET exchange_tickets = v_tickets WHERE discord_user_id = p_user_id;
    
    -- ミュータント抽選 (3%)
    v_is_mutant := random() < 0.03;
    
    -- バッジを付与
    INSERT INTO user_badges_new (user_id, badge_id, purchased_price, is_mutant)
    VALUES (p_user_id, p_badge_id, 0, v_is_mutant);
    
    RETURN jsonb_build_object('ok', true, 'is_mutant', v_is_mutant);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$;

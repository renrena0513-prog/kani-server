CREATE OR REPLACE FUNCTION public.revert_activity_log(p_log_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_log record;
    v_coin_delta bigint := 0;
    v_asset_delta bigint := 0;
    v_ticket_delta int := 0;
    v_ex_ticket_rarity text := NULL;
    v_ex_ticket_delta int := 0;
    v_badge_uuid uuid := NULL;
    v_payment_type text;
BEGIN
    SELECT * INTO v_log FROM activity_logs WHERE id = p_log_id;
    IF NOT FOUND THEN RETURN json_build_object('ok', false, 'error', '対象のログが見つかりません'); END IF;

    -- 【コイン・総資産の差し戻し】
    v_coin_delta := -COALESCE(v_log.amount, 0);
    IF v_log.amount > 0 THEN v_asset_delta := -v_log.amount; END IF;

    -- 【祈願符の差し戻し（おみくじ報酬）】
    IF v_log.details->>'ticket_reward' IS NOT NULL THEN
        v_ticket_delta := v_ticket_delta - (v_log.details->>'ticket_reward')::int;
    END IF;

    -- 【ガチャ取消処理】
    IF v_log.action_type = 'gacha_draw' THEN
        -- 支払い方法を確認
        v_payment_type := COALESCE(v_log.details->>'payment_type', 'ticket');
        
        IF v_payment_type = 'coin' THEN
            -- コイン支払いだった場合はコインを返却（amountが-50なので、-(-50)=+50になる）
            -- v_coin_deltaは既に -v_log.amount で計算済みなのでそのまま
            NULL;
        ELSE
            -- 祈願符支払いだった場合は祈願符を返却
            v_ticket_delta := v_ticket_delta + 1;
        END IF;
        
        -- 引換券が当たっていた場合は剥奪
        IF v_log.details->>'result_type' = 'exchange_ticket' OR v_log.details->>'type' = 'exchange_ticket' THEN
            v_ex_ticket_rarity := v_log.details->>'rarity';
            v_ex_ticket_delta := -1;
        END IF;
        
        -- バッジが当たっていた場合は剥奪
        IF v_log.badge_id IS NOT NULL THEN
            SELECT uuid INTO v_badge_uuid FROM user_badges_new 
            WHERE user_id = v_log.user_id AND badge_id = v_log.badge_id 
            LIMIT 1;
            
            IF v_badge_uuid IS NOT NULL THEN
                DELETE FROM user_badges_new WHERE uuid = v_badge_uuid;
            END IF;
        END IF;
    END IF;

    -- 【バッジ購入の取消処理】
    IF v_log.action_type = 'badge_purchase' THEN
        IF v_log.details->>'payment_method' = 'ticket' THEN
            v_ex_ticket_rarity := v_log.details->>'ticket_rarity';
            v_ex_ticket_delta := 1;
        END IF;
        
        IF v_log.badge_id IS NOT NULL THEN
            SELECT uuid INTO v_badge_uuid FROM user_badges_new 
            WHERE user_id = v_log.user_id AND badge_id = v_log.badge_id 
            LIMIT 1;
            
            IF v_badge_uuid IS NOT NULL THEN
                DELETE FROM user_badges_new WHERE uuid = v_badge_uuid;
            END IF;
        END IF;
    END IF;

    -- 【プロフィール更新】
    UPDATE profiles SET 
        coins = coins + v_coin_delta,
        total_assets = total_assets + v_asset_delta,
        gacha_tickets = gacha_tickets + v_ticket_delta,
        exchange_tickets = CASE WHEN v_ex_ticket_rarity IS NOT NULL THEN
            jsonb_set(COALESCE(exchange_tickets, '{}'::jsonb), ARRAY[v_ex_ticket_rarity],
                (GREATEST(0, COALESCE((exchange_tickets->>v_ex_ticket_rarity)::int, 0) + v_ex_ticket_delta))::text::jsonb)
            ELSE exchange_tickets END
    WHERE discord_user_id = v_log.user_id;

    DELETE FROM activity_logs WHERE id = p_log_id;
    RETURN json_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN RETURN json_build_object('ok', false, 'error', SQLERRM);
END;
$function$;

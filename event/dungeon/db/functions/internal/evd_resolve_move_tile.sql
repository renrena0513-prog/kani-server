create or replace function public.evd_resolve_move_tile(
    p_run_id uuid,
    p_tile_type text
)
returns jsonb
language plpgsql
as $$
declare
    v_run public.evd_game_runs%rowtype;
    v_message text := '';
    v_damage integer := 0;
    v_coin_delta integer := 0;
    v_actual_coin_loss integer := 0;
    v_rate_delta numeric := 0;
    v_actual_rate_delta numeric := 0;
    v_new_multiplier numeric := 1;
    v_gacha_gain integer := 0;
    v_mangan_gain integer := 0;
    v_offers jsonb;
    v_item jsonb;
    v_pick_item_code text;
    v_pick_item_name text;
begin
    select *
      into v_run
      from public.evd_game_runs
     where id = p_run_id
     for update;

    if not found then
        raise exception '進行中ランが見つかりません';
    end if;

    case p_tile_type
        when '小銭' then
            v_coin_delta := public.evd_get_floor_value(v_run.generation_profile_id, v_run.current_floor, '小銭')::integer;
            v_coin_delta := v_coin_delta + public.evd_compute_coin_pickup_bonus(v_run.inventory_state);
            v_message := format('小銭を拾い、%s コイン獲得した。', v_coin_delta);
        when '宝箱' then
            v_coin_delta := public.evd_get_floor_value(v_run.generation_profile_id, v_run.current_floor, '宝箱')::integer;
            v_message := format('宝箱を開けて %s コイン獲得した。', v_coin_delta);
        when '財宝箱' then
            v_coin_delta := public.evd_get_floor_value(v_run.generation_profile_id, v_run.current_floor, '財宝箱')::integer;
            v_message := format('財宝箱を開けて %s コイン獲得した。', v_coin_delta);
        when '秘宝箱' then
            update public.evd_game_runs
               set badges_gained = badges_gained + 1
             where id = p_run_id;
            v_message := '秘宝箱を開けて、勲章を 1 個獲得した。';
        when '宝石箱' then
            v_gacha_gain := greatest(0, coalesce(public.evd_get_floor_value(v_run.generation_profile_id, v_run.current_floor, '祈願符')::integer, 0));
            v_mangan_gain := greatest(0, coalesce(public.evd_get_floor_value(v_run.generation_profile_id, v_run.current_floor, '満願符')::integer, 0));
            update public.evd_game_runs
               set gacha_tickets_gained = gacha_tickets_gained + v_gacha_gain,
                   mangan_tickets_gained = mangan_tickets_gained + v_mangan_gain
             where id = p_run_id;
            v_message := format('宝石箱を開けて祈願符 %s 枚、満願符 %s 枚を獲得した。', v_gacha_gain, v_mangan_gain);
        when 'アイテム' then
            v_item := public.evd_draw_pickup_item();
            v_pick_item_code := nullif(v_item ->> 'item_code', '');
            v_pick_item_name := nullif(v_item ->> 'item_name', '');

            if v_pick_item_code is null then
                v_message := 'アイテムマスだったが、取得できるアイテムが見つからなかった。';
            else
                update public.evd_game_runs
                   set inventory_state = public.evd_dispatch_apply_granted_item(inventory_state, v_pick_item_code)
                 where id = p_run_id;
                v_message := format('%s を入手した。', v_pick_item_name);
            end if;
        when '祝福' then
            v_rate_delta := public.evd_get_floor_value(v_run.generation_profile_id, v_run.current_floor, '祝福', true);
            update public.evd_game_runs
               set final_return_multiplier = round((final_return_multiplier + v_rate_delta)::numeric, 2)
             where id = p_run_id
            returning final_return_multiplier into v_new_multiplier;
            v_message := format('祝福を受け、持ち帰り倍率が +%s 上昇して x%s になった。', v_rate_delta, v_new_multiplier);
        when '泉' then
            update public.evd_game_runs
               set life = least(max_life, life + 1)
             where id = p_run_id;
            v_message := '泉の力でライフが 1 回復した。';
        when '爆弾' then
            v_damage := 1;
            v_message := '爆弾が爆発し、ライフを 1 失った。';
        when '大爆発' then
            v_damage := 2;
            v_message := '大爆発に巻き込まれ、ライフを 2 失った。';
        when '呪い' then
            v_coin_delta := -1 * public.evd_get_floor_value(v_run.generation_profile_id, v_run.current_floor, '呪い')::integer;
            v_actual_coin_loss := least(abs(v_coin_delta), coalesce(v_run.run_coins, 0));
            v_message := format('呪いを受け、%s コイン失った。', v_actual_coin_loss);
        when '罠' then
            v_rate_delta := public.evd_get_floor_value(v_run.generation_profile_id, v_run.current_floor, '罠', true);
            if v_run.substitute_negates_remaining > 0 then
                update public.evd_game_runs
                   set substitute_negates_remaining = substitute_negates_remaining - 1
                 where id = p_run_id;
                v_message := format('身代わり人形が壊れて %s の悪影響を防いだ。あと %s 回。', p_tile_type, greatest(v_run.substitute_negates_remaining - 1, 0));
            else
                v_new_multiplier := round(greatest(0.30, (v_run.final_return_multiplier - v_rate_delta))::numeric, 2);
                v_actual_rate_delta := round(greatest(0::numeric, v_run.final_return_multiplier - v_new_multiplier)::numeric, 2);
                update public.evd_game_runs
                   set final_return_multiplier = v_new_multiplier
                 where id = p_run_id;
                v_message := format('罠の影響で持ち帰り倍率が -%s 下がり、x%s になった。', to_char(v_actual_rate_delta, 'FM0.00'), to_char(v_new_multiplier, 'FM0.00'));
            end if;
        when 'ショップ' then
            v_offers := public.evd_generate_shop_offers(p_run_id, 'ショップ');
            update public.evd_game_runs
               set inventory_state = jsonb_set(inventory_state, array['pending_shop'], jsonb_build_object('shop_type', 'ショップ', 'offers', v_offers), true)
             where id = p_run_id;
            v_message := '行商人が現れた。品揃えを確認できる。';
        when '限定ショップ' then
            v_offers := public.evd_generate_shop_offers(p_run_id, '限定ショップ');
            update public.evd_game_runs
               set inventory_state = jsonb_set(inventory_state, array['pending_shop'], jsonb_build_object('shop_type', '限定ショップ', 'offers', v_offers), true)
             where id = p_run_id;
            v_message := '限定ショップを見つけた。珍しい品が並んでいる。';
        when '下り階段' then
            v_message := case
                when v_run.current_floor >= v_run.max_floors then '最終階の下り階段に到達した。'
                else '下り階段を見つけた。'
            end;
        else
            v_message := '何も起こらなかった。';
    end case;

    select *
      into v_run
      from public.evd_game_runs
     where id = p_run_id
     for update;

    if v_damage > 0 then
        if v_run.substitute_negates_remaining > 0 then
            update public.evd_game_runs
               set substitute_negates_remaining = substitute_negates_remaining - 1
             where id = p_run_id;
            v_message := format('身代わり人形が壊れて %s のダメージを防いだ。あと %s 回。', p_tile_type, greatest(v_run.substitute_negates_remaining - 1, 0));
        else
            update public.evd_game_runs
               set life = greatest(life - v_damage, 0)
             where id = p_run_id;
        end if;
    end if;

    if v_coin_delta <> 0 then
        if v_run.substitute_negates_remaining > 0 and v_coin_delta < 0 then
            update public.evd_game_runs
               set substitute_negates_remaining = substitute_negates_remaining - 1
             where id = p_run_id;
            v_message := format('身代わり人形が壊れて %s のコイン損失を防いだ。あと %s 回。', p_tile_type, greatest(v_run.substitute_negates_remaining - 1, 0));
        else
            update public.evd_game_runs
               set run_coins = greatest(run_coins + v_coin_delta, 0)
             where id = p_run_id;
        end if;
    end if;

    return jsonb_build_object(
        'message', v_message,
        'item_code', v_pick_item_code,
        'item_name', v_pick_item_name,
        'return_snapshot', false
    );
end;
$$;

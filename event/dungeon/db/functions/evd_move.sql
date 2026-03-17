create or replace function public.evd_move(p_run_id uuid, p_direction text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id text := public.evd_current_user_id();
    v_run public.evd_game_runs%rowtype;
    v_floor public.evd_run_floors%rowtype;
    v_grid jsonb;
    v_cell jsonb;
    v_flags jsonb;
    v_next_x integer;
    v_next_y integer;
    v_damage integer := 0;
    v_coin_delta integer := 0;
    v_message text := '';
    v_rate_delta numeric := 0;
    v_new_multiplier numeric := 1;
    v_gacha_rate numeric := 0;
    v_mangan_rate numeric := 0;
    v_gacha_gain integer := 0;
    v_mangan_gain integer := 0;
    v_ransom integer := 0;
    v_item_to_lose text;
    v_item_to_lose_name text;
    v_pick_item_code text;
    v_pick_item_name text;
    v_pick_item_effect text;
    v_offers jsonb;
begin
    if v_user_id = '' then
        raise exception 'ログインが必要です';
    end if;

    perform pg_advisory_xact_lock(hashtext('evd:' || v_user_id));

    select * into v_run from public.evd_game_runs where id = p_run_id and user_id = v_user_id and status = '進行中' for update;
    if not found then
        raise exception '進行中のランが見つかりません';
    end if;

    if coalesce(v_run.inventory_state -> 'pending_shop', 'null'::jsonb) <> 'null'::jsonb then
        raise exception 'ショップの処理を先に完了してください';
    end if;

    select * into v_floor from public.evd_run_floors where run_id = p_run_id and floor_no = v_run.current_floor for update;

    v_next_x := v_run.current_x + case p_direction when 'left' then -1 when 'right' then 1 else 0 end;
    v_next_y := v_run.current_y + case p_direction when 'up' then -1 when 'down' then 1 else 0 end;

    if v_next_x < 0 or v_next_x >= v_run.board_size or v_next_y < 0 or v_next_y >= v_run.board_size then
        raise exception 'その方向には進めません';
    end if;

    v_grid := v_floor.grid;
    v_cell := public.evd_get_cell(v_grid, v_next_x, v_next_y);
    v_flags := coalesce(v_run.inventory_state -> 'flags', '{}'::jsonb);

    v_cell := jsonb_set(jsonb_set(v_cell, array['revealed'], 'true'::jsonb, true), array['visited'], 'true'::jsonb, true);
    v_grid := public.evd_set_cell(v_grid, v_next_x, v_next_y, v_cell);

    update public.evd_game_runs
       set current_x = v_next_x,
           current_y = v_next_y,
           updated_at = now(),
           last_active_at = now(),
           version = version + 1
     where id = p_run_id;

    update public.evd_run_floors
       set grid = v_grid,
           revealed = case when not (v_floor.revealed @> jsonb_build_array(format('%s,%s', v_next_x, v_next_y))) then v_floor.revealed || jsonb_build_array(format('%s,%s', v_next_x, v_next_y)) else v_floor.revealed end,
           visited = case when not (v_floor.visited @> jsonb_build_array(format('%s,%s', v_next_x, v_next_y))) then v_floor.visited || jsonb_build_array(format('%s,%s', v_next_x, v_next_y)) else v_floor.visited end,
           updated_at = now()
     where id = v_floor.id;

    if coalesce((v_cell ->> 'resolved')::boolean, false) then
        return public.evd_build_snapshot(p_run_id, v_user_id);
    end if;

    case v_cell ->> 'type'
        when '小銭' then
            v_coin_delta := public.evd_get_floor_value(v_run.generation_profile_id, v_run.current_floor, '小銭')::integer;
            v_message := format('小銭を拾い、%s コイン獲得した。', v_coin_delta);
        when '宝箱' then
            v_coin_delta := public.evd_get_floor_value(v_run.generation_profile_id, v_run.current_floor, '宝箱')::integer;
            v_message := format('宝箱を開け、%s コイン獲得した。', v_coin_delta);
        when '財宝箱' then
            v_coin_delta := public.evd_get_floor_value(v_run.generation_profile_id, v_run.current_floor, '財宝箱')::integer;
            v_message := format('財宝箱から %s コイン獲得した。', v_coin_delta);
        when '秘宝箱' then
            update public.evd_game_runs set badges_gained = badges_gained + 1 where id = p_run_id;
            v_message := '秘宝箱を見つけ、秘宝バッジを 1 個確保した。';
        when '宝石箱' then
            v_gacha_gain := greatest(0, coalesce(public.evd_get_floor_value(v_run.generation_profile_id, v_run.current_floor, '祈願符')::integer, 0));
            v_mangan_gain := greatest(0, coalesce(public.evd_get_floor_value(v_run.generation_profile_id, v_run.current_floor, '満願符')::integer, 0));
            update public.evd_game_runs
               set gacha_tickets_gained = gacha_tickets_gained + v_gacha_gain,
                   mangan_tickets_gained = mangan_tickets_gained + v_mangan_gain
             where id = p_run_id;
            v_message := format('宝石箱から祈願符 %s 枚、満願符 %s 枚を得た。', v_gacha_gain, v_mangan_gain);
        when 'アイテム' then
            with weighted_pool as (
                select
                    code,
                    name,
                    effect_data ->> 'effect' as effect,
                    weight,
                    sum(weight) over () as total_weight,
                    sum(weight) over (order by sort_order, code) as cumulative_weight
                 from public.evd_item_catalog
                 where is_active = true
                   and weight > 0
            ),
            draw as (
                select random() * coalesce(max(total_weight), 0) as roll
                  from weighted_pool
            )
            select wp.code, wp.name, wp.effect
              into v_pick_item_code, v_pick_item_name, v_pick_item_effect
              from weighted_pool wp
              cross join draw d
             where wp.cumulative_weight >= d.roll
             order by wp.cumulative_weight
             limit 1;

            if v_pick_item_code is null then
                v_message := '不思議なマスだったが、何も手に入らなかった。';
            elsif v_pick_item_effect = 'substitute' then
                update public.evd_game_runs
                   set substitute_negates_remaining = substitute_negates_remaining + 3
                 where id = p_run_id;
                v_message := format('%s を引き当てた。身代わり効果が付与された。', v_pick_item_name);
            elsif v_pick_item_effect = 'insurance' then
                update public.evd_game_runs
                   set inventory_state = public.evd_add_bucket_item(
                        jsonb_set(inventory_state, array['flags', 'insurance_active'], 'true'::jsonb, true),
                        'carried_items',
                        v_pick_item_code,
                        1
                   )
                 where id = p_run_id;
                v_message := format('%s を引き当てた。死亡時保険が有効化された。', v_pick_item_name);
            elsif v_pick_item_effect = 'golden_contract' then
                update public.evd_game_runs
                   set inventory_state = jsonb_set(inventory_state, array['flags', 'golden_contract_active'], 'true'::jsonb, true)
                 where id = p_run_id;
                v_message := format('%s を引き当てた。帰還時の倍率効果が有効化された。', v_pick_item_name);
            elsif v_pick_item_effect = 'vault_box' then
                update public.evd_game_runs
                   set inventory_state = public.evd_add_bucket_item(inventory_state, 'carried_items', v_pick_item_code, 1)
                 where id = p_run_id;
                v_message := format('%s を引き当てた。死亡時に所持コインの 80%% を持ち帰れる。', v_pick_item_name);
            else
                update public.evd_game_runs
                   set inventory_state = public.evd_add_item(inventory_state, v_pick_item_code, 1)
                 where id = p_run_id;
                v_message := format('%s を手に入れた。', v_pick_item_name);
            end if;
        when '祝福' then
            v_rate_delta := public.evd_get_floor_value(v_run.generation_profile_id, v_run.current_floor, '祝福', true);
            update public.evd_game_runs
               set final_return_multiplier = round((final_return_multiplier + v_rate_delta)::numeric, 2)
             where id = p_run_id
            returning final_return_multiplier into v_new_multiplier;
            v_message := format('祝福が宿り、最終持ち帰り倍率が +%s され x%s になった。', v_rate_delta, v_new_multiplier);
        when '泉' then
            update public.evd_game_runs
               set life = least(max_life, life + 1)
             where id = p_run_id;
            v_message := '泉の力でライフを 1 回復した。';
        when '爆弾' then
            v_damage := 1;
            v_message := '爆弾を踏み、ライフを 1 失った。';
        when '大爆発' then
            v_damage := 2;
            v_message := '大爆発に巻き込まれ、ライフを 2 失った。';
        when '罠' then
            v_coin_delta := -1 * public.evd_get_floor_value(v_run.generation_profile_id, v_run.current_floor, '罠')::integer;
            v_message := format('罠にかかり、%s コイン失った。', abs(v_coin_delta));
        when '呪い' then
            v_rate_delta := public.evd_get_floor_value(v_run.generation_profile_id, v_run.current_floor, '呪い', true);
            update public.evd_game_runs
               set final_return_multiplier = round(greatest(0.30, (final_return_multiplier - v_rate_delta))::numeric, 2)
             where id = p_run_id
            returning final_return_multiplier into v_new_multiplier;
            v_message := format('呪いにより最終持ち帰り倍率が -%s され x%s になった。', v_rate_delta, v_new_multiplier);
        when '盗賊' then
            v_ransom := coalesce(public.evd_get_floor_value(v_run.generation_profile_id, v_run.current_floor, '盗賊')::integer, 150);
            if exists (
                select 1
                  from jsonb_each(coalesce(v_run.inventory_state -> 'items', '{}'::jsonb)) e
                 where coalesce((e.value ->> 'quantity')::integer, 0) > 0
            ) then
                if v_run.run_coins >= v_ransom then
                    v_coin_delta := -1 * v_ransom;
                    v_message := format('盗賊に遭遇したが、%s コイン支払って荷物を守った。', v_ransom);
                else
                    select key into v_item_to_lose
                      from jsonb_each(v_run.inventory_state -> 'items')
                     where coalesce((value ->> 'quantity')::integer, 0) > 0
                     limit 1;
                    select name into v_item_to_lose_name
                      from public.evd_item_catalog
                     where code = v_item_to_lose;
                    update public.evd_game_runs
                       set inventory_state = public.evd_remove_bucket_item(public.evd_remove_item(inventory_state, v_item_to_lose, 1), 'carried_items', v_item_to_lose, 1)
                     where id = p_run_id;
                    v_message := format('盗賊に襲われ、%s を 1 個奪われた。', coalesce(v_item_to_lose_name, v_item_to_lose));
                end if;
            else
                v_coin_delta := -1 * least(v_run.run_coins, v_ransom);
                v_message := format('盗賊に遭遇し、%s コイン奪われた。', abs(v_coin_delta));
            end if;
        when '落とし穴' then
            v_damage := 1;
            v_message := '落とし穴に落ち、ライフを 1 失って 1 階下へ落下した。';
        when '転送罠' then
            v_message := '転送罠が発動し、2 階層上へ戻された。';
        when 'ショップ' then
            v_offers := public.evd_generate_shop_offers('ショップ');
            update public.evd_game_runs
               set inventory_state = jsonb_set(inventory_state, array['pending_shop'], jsonb_build_object('shop_type', 'ショップ', 'offers', v_offers), true)
             where id = p_run_id;
            v_message := '行商人が店を広げた。';
        when '限定ショップ' then
            v_offers := public.evd_generate_shop_offers('限定ショップ');
            update public.evd_game_runs
               set inventory_state = jsonb_set(inventory_state, array['pending_shop'], jsonb_build_object('shop_type', '限定ショップ', 'offers', v_offers), true)
             where id = p_run_id;
            v_message := '珍しい商人が隠し市を開いた。';
        when '下り階段' then
            v_message := '下り階段を見つけた。';
        else
            v_message := '何も起こらなかった。';
    end case;

    if v_damage > 0 then
        if v_run.substitute_negates_remaining > 0 then
            update public.evd_game_runs
               set substitute_negates_remaining = substitute_negates_remaining - 1
             where id = p_run_id;
            v_message := format('身代わり人形が砕け、%s を無効化した。', v_cell ->> 'type');
            v_damage := 0;
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
            v_message := format('身代わり人形が砕け、%s を無効化した。', v_cell ->> 'type');
        else
            update public.evd_game_runs
               set run_coins = greatest(run_coins + v_coin_delta, 0)
             where id = p_run_id;
        end if;
    end if;

    v_cell := jsonb_set(v_cell, array['resolved'], 'true'::jsonb, true);
    v_grid := public.evd_set_cell(v_grid, v_next_x, v_next_y, v_cell);
    update public.evd_run_floors set grid = v_grid where id = v_floor.id;

    perform public.evd_add_log(
        p_run_id,
        v_user_id,
        v_run.account_name,
        v_run.current_floor,
        'マス公開',
        v_message,
        jsonb_build_object('tile_type', v_cell ->> 'type')
            || case
                when (v_cell ->> 'type') = 'アイテム' and v_pick_item_code is not null then
                    jsonb_build_object('item_code', v_pick_item_code, 'item_name', v_pick_item_name)
                else '{}'::jsonb
            end
    );

    select * into v_run from public.evd_game_runs where id = p_run_id;

    if v_run.life <= 0 then
        return public.evd_finish_run(p_run_id, v_user_id, '死亡', '迷宮で力尽きた');
    end if;

    if (v_cell ->> 'type') = '落とし穴' then
        perform public.evd_resolve_floor_shift(p_run_id, v_user_id, least(v_run.max_floors, v_run.current_floor + 1), '落下移動');
    elsif (v_cell ->> 'type') = '転送罠' then
        perform public.evd_resolve_floor_shift(p_run_id, v_user_id, greatest(1, v_run.current_floor - 2), '転送移動');
    end if;

    return public.evd_build_snapshot(p_run_id, v_user_id);
end;
$$;

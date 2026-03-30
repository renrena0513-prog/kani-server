create or replace function public.evd_start_run(p_carry_items text[] default '{}')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id text := public.evd_current_user_id();
    v_run_id uuid;
    v_profile_id uuid;
    v_profile record;
    v_floor_seed jsonb;
    v_bomb_count integer := 0;
    v_max_life integer := 3;
    v_inventory jsonb := jsonb_build_object(
        'items', '{}'::jsonb,
        'flags', jsonb_build_object(
            'insurance_active', false,
            'golden_contract_active', false,
            'stairs_known', false,
        'hazards_known', false,
        'bombs_known', false
        ),
        'carried_items', '{}'::jsonb,
        'pending_resolution', null,
        'pending_shop', null
    );
    v_item text;
    v_effect text;
    v_carry_limit integer := 2;
    v_initial_return_multiplier numeric(8, 2) := 1.0;
    v_golden_return_bonus numeric(8, 2) := 0.0;
    v_has_doom_eye boolean := false;
begin
    if v_user_id = '' then
        raise exception 'ログインが必要です';
    end if;

    perform pg_advisory_xact_lock(hashtext('evd:' || v_user_id));

    if exists (select 1 from public.evd_game_runs where user_id = v_user_id and status = '進行中') then
        raise exception '進行中のランがあります';
    end if;

    select discord_user_id, coins, account_name into v_profile
      from public.profiles
     where discord_user_id = v_user_id
     for update;

    if not found then
        raise exception 'プロフィールが見つかりません';
    end if;

    if coalesce(v_profile.coins, 0) < 1000 then
        raise exception 'コインが足りません';
    end if;

    update public.profiles
       set coins = coins - 1000
     where discord_user_id = v_user_id;

    select id
      into v_profile_id
      from public.evd_game_balance_profiles
     where is_active = true
     order by updated_at desc
     limit 1;

    if exists (
        select 1
          from public.evd_player_item_stocks st
          join public.evd_item_catalog c on c.code = st.item_code
         where st.user_id = v_user_id
           and st.quantity > 0
           and c.is_active = true
           and c.effect_data ->> 'effect' = 'relic_carry_limit_plus_1'
    ) then
        v_carry_limit := 3;
    end if;

    if array_length(p_carry_items, 1) > v_carry_limit then
        raise exception '持ち込みは % 個までです', v_carry_limit;
    end if;

    select least(coalesce(sum(st.quantity), 0), 4) * 0.05
      into v_golden_return_bonus
      from public.evd_player_item_stocks st
      join public.evd_item_catalog c
        on c.code = st.item_code
     where st.user_id = v_user_id
       and st.quantity > 0
       and c.is_active = true
       and c.effect_data ->> 'effect' = 'relic_return_multiplier_plus_0_05';

    v_initial_return_multiplier := round((1.0 + coalesce(v_golden_return_bonus, 0))::numeric, 2);

    select exists (
        select 1
          from public.evd_player_item_stocks st
          join public.evd_item_catalog c on c.code = st.item_code
         where st.user_id = v_user_id
           and st.quantity > 0
           and c.is_active = true
           and c.effect_data ->> 'effect' = 'relic_bomb_radar_always'
    )
      into v_has_doom_eye;

    update public.evd_player_item_stocks
       set is_set = case
            when item_code = any(coalesce(p_carry_items, '{}'::text[])) then true
            else false
       end,
           account_name = v_profile.account_name,
           updated_at = now()
     where user_id = v_user_id;

    foreach v_item in array p_carry_items loop
        update public.evd_player_item_stocks
           set quantity = quantity - 1,
               account_name = v_profile.account_name,
               updated_at = now()
         where user_id = v_user_id
           and item_code = v_item
           and quantity > 0;

        if not found then
            raise exception '持ち込み在庫が不足しています: %', v_item;
        end if;

        v_inventory := public.evd_add_bucket_item(v_inventory, 'carried_items', v_item, 1);

        select effect_data ->> 'effect' into v_effect from public.evd_item_catalog where code = v_item;
        if v_effect = 'substitute' then
            v_inventory := jsonb_set(v_inventory, array['flags', 'substitute_ready'], 'true'::jsonb, true);
        elsif v_effect = 'insurance' then
            v_inventory := jsonb_set(v_inventory, array['flags', 'insurance_active'], 'true'::jsonb, true);
        elsif v_effect = 'golden_contract' then
            v_inventory := public.evd_add_item(v_inventory, v_item, 1);
        elsif v_effect = 'vault_box' then
            null;
        else
            v_inventory := public.evd_add_item(v_inventory, v_item, 1);
        end if;
    end loop;

    if exists (
        select 1
          from public.evd_player_item_stocks st
          join public.evd_item_catalog c on c.code = st.item_code
         where st.user_id = v_user_id
           and st.quantity > 0
           and c.is_active = true
           and c.shop_pool = 'レリック'
           and c.effect_data ->> 'effect' = 'relic_max_life_plus_1'
    ) then
        v_max_life := v_max_life + 1;
        v_inventory := jsonb_set(v_inventory, array['flags', 'relic_giant_cup_active'], 'true'::jsonb, true);
    end if;

    insert into public.evd_game_runs (
        user_id, account_name, generation_profile_id, status, life, max_life, inventory_state, substitute_negates_remaining, final_return_multiplier
    )
    values (
        v_user_id,
        v_profile.account_name,
        v_profile_id,
        '進行中',
        v_max_life,
        v_max_life,
        v_inventory,
        case when coalesce((v_inventory -> 'flags' ->> 'substitute_ready')::boolean, false) then 3 else 0 end,
        v_initial_return_multiplier
    )
    returning id into v_run_id;

    v_floor_seed := public.evd_generate_floor(v_profile_id, 1, 7);

    insert into public.evd_run_floors (
        run_id, user_id, account_name, floor_no, start_x, start_y, stairs_x, stairs_y, grid, revealed, visited, floor_status
    )
    values (
        v_run_id,
        v_user_id,
        v_profile.account_name,
        1,
        (v_floor_seed ->> 'start_x')::integer,
        (v_floor_seed ->> 'start_y')::integer,
        (v_floor_seed ->> 'stairs_x')::integer,
        (v_floor_seed ->> 'stairs_y')::integer,
        v_floor_seed -> 'grid',
        v_floor_seed -> 'revealed',
        v_floor_seed -> 'visited',
        '進行中'
    );

    perform public.evd_add_log(v_run_id, v_user_id, v_profile.account_name, 1, 'プレイ開始', '欲望渦巻くダンジョンへ入場した。', jsonb_build_object('carry_items', p_carry_items));

    if coalesce((v_inventory -> 'flags' ->> 'relic_giant_cup_active')::boolean, false) then
        perform public.evd_add_log(
            v_run_id,
            v_user_id,
            v_profile.account_name,
            1,
            'レリック効果',
            '巨人の盃が輝き、最大LIFEが 1 増加した。',
            jsonb_build_object('effect', 'relic_max_life_plus_1')
        );
    end if;

    if coalesce(v_golden_return_bonus, 0) > 0 then
        perform public.evd_add_log(
            v_run_id,
            v_user_id,
            v_profile.account_name,
            1,
            'レリック効果',
            format('黄金の帰路が導き、初期持ち帰り倍率が +%s された。', to_char(v_golden_return_bonus, 'FM0.00')),
            jsonb_build_object('effect', 'relic_return_multiplier_plus_0_05', 'bonus', v_golden_return_bonus)
        );
    end if;

    if coalesce((v_inventory -> 'items' -> 'bomb_radar' ->> 'quantity')::integer, 0) > 0 or v_has_doom_eye then
        select count(*)
          into v_bomb_count
          from jsonb_array_elements(v_floor_seed -> 'grid') as row_cells(cell_row)
          cross join jsonb_array_elements(row_cells.cell_row) as cell(cell_item)
         where cell.cell_item ->> 'type' in ('爆弾', '大爆発');

        perform public.evd_add_log(
            v_run_id,
            v_user_id,
            v_profile.account_name,
            1,
            case when v_has_doom_eye then 'レリック効果' else '爆弾レーダー' end,
            case when v_has_doom_eye
                 then format('破滅の魔眼がこの階層の爆弾を暴いた。爆弾は %s 個あるようだ・・・', v_bomb_count)
                 else format('爆弾レーダーが反応を示した！この階層には爆弾が %s 個あるようだ・・・', v_bomb_count)
            end,
            jsonb_build_object('bomb_count', v_bomb_count, 'effect', case when v_has_doom_eye then 'relic_bomb_radar_always' else 'bomb_radar' end)
        );
    end if;

    return public.evd_build_snapshot(v_run_id, v_user_id);
end;
$$;

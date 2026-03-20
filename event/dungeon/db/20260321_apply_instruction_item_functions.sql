create or replace function public.evd_use_item(p_run_id uuid, p_item_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id text := public.evd_current_user_id();
    v_run public.evd_game_runs%rowtype;
    v_bonus_sum integer := 0;
    v_should_consume boolean := true;
    v_claimed_floor_bonuses jsonb := '[]'::jsonb;
    v_new_claimed_floors jsonb := '[]'::jsonb;
    v_offers jsonb := '[]'::jsonb;
begin
    perform pg_advisory_xact_lock(hashtext('evd:' || v_user_id));

    select * into v_run from public.evd_game_runs where id = p_run_id and user_id = v_user_id and status = '進行中' for update;
    if not found then
        raise exception '進行中のランが見つかりません';
    end if;

    if coalesce((v_run.inventory_state -> 'items' -> p_item_code ->> 'quantity')::integer, 0) <= 0 then
        raise exception 'そのアイテムは所持していません';
    end if;

    case p_item_code
        when 'escape_rope' then
            v_should_consume := true;
            perform public.evd_add_log(p_run_id, v_user_id, v_run.account_name, v_run.current_floor, 'アイテム使用', '脱出のひもで帰還した。');
        when 'bomb_radar' then
            v_should_consume := false;
            raise exception '爆弾レーダーは所持しているだけで常時有効です';
        when 'healing_potion' then
            v_should_consume := true;
            update public.evd_game_runs set life = least(max_life, life + 1) where id = p_run_id;
            perform public.evd_add_log(p_run_id, v_user_id, v_run.account_name, v_run.current_floor, 'アイテム使用', '回復ポーションでライフを 1 回復した。');
        when 'super_healing_potion' then
            v_should_consume := true;
            update public.evd_game_runs set life = least(max_life, life + 2) where id = p_run_id;
            perform public.evd_add_log(p_run_id, v_user_id, v_run.account_name, v_run.current_floor, 'アイテム使用', '上級回復ポーションでライフを 2 回復した。');
        when 'stairs_search' then
            v_should_consume := true;
            update public.evd_game_runs set inventory_state = jsonb_set(inventory_state, array['flags', 'stairs_known'], 'true'::jsonb, true) where id = p_run_id;
            perform public.evd_add_log(p_run_id, v_user_id, v_run.account_name, v_run.current_floor, 'アイテム使用', '階段サーチで下り階段の位置が見えた。');
        when 'calamity_map' then
            v_should_consume := true;
            update public.evd_game_runs set inventory_state = jsonb_set(inventory_state, array['flags', 'hazards_known'], 'true'::jsonb, true) where id = p_run_id;
            perform public.evd_add_log(p_run_id, v_user_id, v_run.account_name, v_run.current_floor, 'アイテム使用', '厄災の地図で危険マスを可視化した。罠、呪い、盗賊、落とし穴、転移罠が見える。');
        when 'full_scan_map' then
            v_should_consume := true;
            update public.evd_game_runs set inventory_state = jsonb_set(inventory_state, array['flags', 'bombs_known'], 'true'::jsonb, true) where id = p_run_id;
            perform public.evd_add_log(p_run_id, v_user_id, v_run.account_name, v_run.current_floor, 'アイテム使用', '完全探査図で爆弾マスを可視化した。');
        when 'holy_grail' then
            v_should_consume := true;
            update public.evd_game_runs set max_life = max_life + 1, life = max_life + 1 where id = p_run_id;
            perform public.evd_add_log(p_run_id, v_user_id, v_run.account_name, v_run.current_floor, 'アイテム使用', '女神の聖杯で完全回復し、最大ライフが 1 増えた。');
        when 'life_vessel' then
            v_should_consume := true;
            update public.evd_game_runs
               set max_life = max_life + 1,
                   life = least(max_life + 1, life + 1)
             where id = p_run_id;
            perform public.evd_add_log(p_run_id, v_user_id, v_run.account_name, v_run.current_floor, 'アイテム使用', '命の器で最大ライフが 1 増えた。');
        when 'abyss_ticket' then
            v_should_consume := true;
            v_claimed_floor_bonuses := coalesce(v_run.inventory_state -> 'flags' -> 'claimed_floor_bonuses', '[]'::jsonb);
            select coalesce(sum(fbp.bonus_coins), 0),
                   coalesce(jsonb_agg(fbp.floor_no order by fbp.floor_no), '[]'::jsonb)
              into v_bonus_sum, v_new_claimed_floors
              from public.evd_floor_bonus_profiles fbp
             where fbp.profile_id = v_run.generation_profile_id
               and fbp.floor_no > v_run.current_floor
               and fbp.floor_no <= least(v_run.current_floor + 3, v_run.max_floors)
               and not (v_claimed_floor_bonuses @> jsonb_build_array(fbp.floor_no));

            update public.evd_game_runs
               set run_coins = run_coins + v_bonus_sum,
                   floor_bonus_total = floor_bonus_total + v_bonus_sum,
                   inventory_state = case
                        when jsonb_array_length(v_new_claimed_floors) > 0 then jsonb_set(
                            inventory_state,
                            array['flags', 'claimed_floor_bonuses'],
                            coalesce(inventory_state -> 'flags' -> 'claimed_floor_bonuses', '[]'::jsonb) || v_new_claimed_floors,
                            true
                        )
                        else inventory_state
                   end
             where id = p_run_id;

            perform public.evd_resolve_floor_shift(p_run_id, v_user_id, least(v_run.current_floor + 3, v_run.max_floors), '進行中');
            perform public.evd_add_log(p_run_id, v_user_id, v_run.account_name, least(v_run.current_floor + 3, v_run.max_floors), 'アイテム使用', format('奈落直通札で %s 階層先へ進み、到達ボーナス %s コインを得た。', least(3, v_run.max_floors - v_run.current_floor), v_bonus_sum));
        when 'merchant_whistle' then
            v_should_consume := true;
            v_offers := public.evd_generate_shop_offers(p_run_id, 'ショップ');
            update public.evd_game_runs
               set inventory_state = jsonb_set(
                    inventory_state,
                    array['pending_shop'],
                    jsonb_build_object('shop_type', 'ショップ', 'offers', v_offers),
                    true
               )
             where id = p_run_id;
            perform public.evd_add_log(p_run_id, v_user_id, v_run.account_name, v_run.current_floor, 'アイテム使用', '商人の笛を吹き、その場に通常ショップを呼び出した。');
        when 'special_merchant_whistle' then
            v_should_consume := true;
            v_offers := public.evd_generate_shop_offers(p_run_id, '限定ショップ');
            update public.evd_game_runs
               set inventory_state = jsonb_set(
                    inventory_state,
                    array['pending_shop'],
                    jsonb_build_object('shop_type', '限定ショップ', 'offers', v_offers),
                    true
               )
             where id = p_run_id;
            perform public.evd_add_log(p_run_id, v_user_id, v_run.account_name, v_run.current_floor, 'アイテム使用', '特別商人の笛を吹き、その場に限定ショップを呼び出した。');
        else
            raise exception 'このアイテムは使用できません';
    end case;

    if v_should_consume then
        update public.evd_game_runs
           set inventory_state = public.evd_remove_bucket_item(public.evd_remove_item(inventory_state, p_item_code, 1), 'carried_items', p_item_code, 1),
               updated_at = now(),
               last_active_at = now(),
               version = version + 1
         where id = p_run_id;
    end if;

    if p_item_code = 'escape_rope' then
        return public.evd_finish_run(p_run_id, v_user_id, '帰還', '脱出のひも');
    end if;

    return public.evd_build_snapshot(p_run_id, v_user_id);
end;
$$;
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
    v_max_floors integer := 10;
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
        'bombs_known', false,
        'claimed_floor_bonuses', '[]'::jsonb
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

    if 'golden_bag' = any(coalesce(p_carry_items, '{}'::text[])) then
        v_carry_limit := v_carry_limit + 2;
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
        user_id, account_name, generation_profile_id, status, life, max_life, max_floors, inventory_state, substitute_negates_remaining, final_return_multiplier
    )
    values (
        v_user_id,
        v_profile.account_name,
        v_profile_id,
        '進行中',
        v_max_life,
        v_max_life,
        v_max_floors,
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

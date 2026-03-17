create or replace function public.evd_current_user_id()
returns text
language sql
stable
as $$
    select coalesce(auth.jwt() -> 'user_metadata' ->> 'provider_id', '');
$$;

create or replace function public.evd_random_int(p_min integer, p_max integer)
returns integer
language sql
as $$
    select floor(random() * ((p_max - p_min) + 1) + p_min)::integer;
$$;

create or replace function public.evd_random_numeric(p_min numeric, p_max numeric)
returns numeric
language sql
as $$
    select round((random() * (p_max - p_min) + p_min)::numeric, 2);
$$;

create or replace function public.evd_pick_weighted(p_weights jsonb)
returns text
language plpgsql
as $$
declare
    v_total integer := 0;
    v_roll numeric;
    v_acc integer := 0;
    v_key text;
    v_val integer;
begin
    for v_key, v_val in
        select key, value::integer
        from jsonb_each_text(p_weights)
    loop
        if v_val > 0 then
            v_total := v_total + v_val;
        end if;
    end loop;

    if v_total <= 0 then
        return '空白';
    end if;

    v_roll := floor(random() * v_total) + 1;

    for v_key, v_val in
        select key, value::integer
        from jsonb_each_text(p_weights)
    loop
        if v_val > 0 then
            v_acc := v_acc + v_val;
            if v_roll <= v_acc then
                return v_key;
            end if;
        end if;
    end loop;

    return '空白';
end;
$$;

create or replace function public.evd_get_range_value(p_config jsonb, p_floor integer, p_key text, p_numeric boolean default false)
returns numeric
language plpgsql
as $$
declare
    v_floor_key text := p_floor::text;
    v_range jsonb;
begin
    v_range := p_config -> 'value_ranges' -> v_floor_key -> p_key;
    if v_range is null then
        return 0;
    end if;

    if p_numeric then
        return public.evd_random_numeric((v_range ->> 0)::numeric, (v_range ->> 1)::numeric);
    end if;

    return public.evd_random_int((v_range ->> 0)::integer, (v_range ->> 1)::integer);
end;
$$;

create or replace function public.evd_get_floor_value(
    p_profile_id uuid,
    p_floor integer,
    p_key text,
    p_numeric boolean default false
)
returns numeric
language plpgsql
as $$
declare
    v_row public.evd_floor_value_profiles%rowtype;
begin
    select *
      into v_row
      from public.evd_floor_value_profiles
     where profile_id = p_profile_id
       and floor_no = p_floor;

    if not found then
        return 0;
    end if;

    case p_key
        when '小銭' then
            return public.evd_random_int(v_row.coin_small_min, v_row.coin_small_max);
        when '宝箱' then
            return public.evd_random_int(v_row.chest_min, v_row.chest_max);
        when '財宝箱' then
            return public.evd_random_int(v_row.treasure_chest_min, v_row.treasure_chest_max);
        when '祝福' then
            if p_numeric then
                return public.evd_random_numeric(v_row.blessing_min, v_row.blessing_max);
            end if;
            return public.evd_random_int(v_row.blessing_min::integer, v_row.blessing_max::integer);
        when '呪い' then
            if p_numeric then
                return public.evd_random_numeric(v_row.curse_min, v_row.curse_max);
            end if;
            return public.evd_random_int(v_row.curse_min::integer, v_row.curse_max::integer);
        when '罠' then
            return public.evd_random_int(v_row.trap_min, v_row.trap_max);
        when '盗賊' then
            return public.evd_random_int(v_row.thief_coin_loss_min, v_row.thief_coin_loss_max);
        when '祈願符' then
            if p_numeric then
                return public.evd_random_numeric(v_row.jewel_gacha_rate_min, v_row.jewel_gacha_rate_max);
            end if;
            return public.evd_random_int(v_row.jewel_gacha_rate_min::integer, v_row.jewel_gacha_rate_max::integer);
        when '満願符' then
            if p_numeric then
                return public.evd_random_numeric(v_row.jewel_mangan_rate_min, v_row.jewel_mangan_rate_max);
            end if;
            return public.evd_random_int(v_row.jewel_mangan_rate_min::integer, v_row.jewel_mangan_rate_max::integer);
        else
            return 0;
    end case;
end;
$$;
create or replace function public.evd_set_cell(p_grid jsonb, p_x integer, p_y integer, p_cell jsonb)
returns jsonb
language sql
immutable
as $$
    select jsonb_set(p_grid, array[p_y::text, p_x::text], p_cell, true);
$$;

create or replace function public.evd_get_cell(p_grid jsonb, p_x integer, p_y integer)
returns jsonb
language sql
immutable
as $$
    select p_grid -> p_y -> p_x;
$$;

create or replace function public.evd_add_item(p_inventory jsonb, p_item_code text, p_amount integer default 1)
returns jsonb
language plpgsql
as $$
declare
    v_qty integer;
begin
    v_qty := coalesce((p_inventory -> 'items' -> p_item_code ->> 'quantity')::integer, 0) + p_amount;
    return jsonb_set(
        p_inventory,
        array['items', p_item_code],
        jsonb_build_object('quantity', v_qty),
        true
    );
end;
$$;

create or replace function public.evd_add_bucket_item(p_inventory jsonb, p_bucket text, p_item_code text, p_amount integer default 1)
returns jsonb
language plpgsql
as $$
declare
    v_qty integer;
begin
    v_qty := coalesce((p_inventory -> p_bucket -> p_item_code ->> 'quantity')::integer, 0) + p_amount;
    return jsonb_set(
        p_inventory,
        array[p_bucket, p_item_code],
        jsonb_build_object('quantity', v_qty),
        true
    );
end;
$$;

create or replace function public.evd_remove_item(p_inventory jsonb, p_item_code text, p_amount integer default 1)
returns jsonb
language plpgsql
as $$
declare
    v_qty integer;
begin
    v_qty := greatest(coalesce((p_inventory -> 'items' -> p_item_code ->> 'quantity')::integer, 0) - p_amount, 0);
    if v_qty = 0 then
        return jsonb_set(p_inventory, array['items', p_item_code], '{"quantity":0}'::jsonb, true);
    end if;

    return jsonb_set(
        p_inventory,
        array['items', p_item_code],
        jsonb_build_object('quantity', v_qty),
        true
    );
end;
$$;

create or replace function public.evd_remove_bucket_item(p_inventory jsonb, p_bucket text, p_item_code text, p_amount integer default 1)
returns jsonb
language plpgsql
as $$
declare
    v_qty integer;
begin
    v_qty := greatest(coalesce((p_inventory -> p_bucket -> p_item_code ->> 'quantity')::integer, 0) - p_amount, 0);
    return jsonb_set(
        p_inventory,
        array[p_bucket, p_item_code],
        jsonb_build_object('quantity', v_qty),
        true
    );
end;
$$;

drop function if exists public.evd_add_log(uuid, text, integer, text, text, jsonb);

create or replace function public.evd_add_log(
    p_run_id uuid,
    p_user_id text,
    p_account_name text,
    p_floor_no integer,
    p_event_type text,
    p_message text,
    p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
as $$
declare
    v_step integer;
begin
    select coalesce(max(step_no), 0) + 1
      into v_step
      from public.evd_run_events
     where run_id = p_run_id;

    insert into public.evd_run_events (run_id, user_id, account_name, floor_no, step_no, event_type, message, payload)
    values (p_run_id, p_user_id, p_account_name, p_floor_no, v_step, p_event_type, p_message, p_payload);
end;
$$;

create or replace function public.evd_build_snapshot(p_run_id uuid, p_user_id text)
returns jsonb
language plpgsql
as $$
declare
    v_run public.evd_game_runs%rowtype;
    v_floor public.evd_run_floors%rowtype;
    v_profile record;
    v_logs jsonb;
    v_next_bonus integer := 0;
begin
    select * into v_run from public.evd_game_runs where id = p_run_id and user_id = p_user_id;
    select * into v_floor from public.evd_run_floors where run_id = p_run_id and floor_no = v_run.current_floor;
    select coins, total_assets, gacha_tickets, mangan_tickets, account_name
      into v_profile
      from public.profiles
     where discord_user_id = p_user_id;

    select coalesce(jsonb_agg(to_jsonb(t) order by t.step_no), '[]'::jsonb)
      into v_logs
      from (
        select event_type, message, created_at, step_no
          from public.evd_run_events
         where run_id = p_run_id
         order by step_no desc
         limit 40
      ) t;

    select coalesce(fbp.bonus_coins, 0)
      into v_next_bonus
      from public.evd_floor_bonus_profiles fbp
     where fbp.profile_id = v_run.generation_profile_id
       and fbp.floor_no = least(v_run.current_floor + 1, v_run.max_floors);

    return jsonb_build_object(
        'run', jsonb_set(to_jsonb(v_run), array['next_floor_bonus'], to_jsonb(coalesce(v_next_bonus, 0)), true),
        'floor', to_jsonb(v_floor),
        'profile', to_jsonb(v_profile),
        'logs', v_logs
    );
end;
$$;

create or replace function public.evd_generate_shop_offers(p_shop_type text)
returns jsonb
language sql
as $$
    select coalesce(jsonb_agg(jsonb_build_object(
        'code', code,
        'name', name,
        'description', description,
        'price', base_price
    )), '[]'::jsonb)
    from (
        select code, name, description, base_price
          from public.evd_item_catalog
         where is_active = true
           and (
                (p_shop_type = 'ショップ' and shop_pool in ('通常', '両方'))
             or (p_shop_type = '限定ショップ' and shop_pool in ('限定', '両方'))
           )
         order by
            case
                when coalesce(weight, 0) > 0 then -ln(greatest(random(), 1e-9)) / weight
                else 1e9 + random()
            end
         limit 3
    ) q;
$$;

create or replace function public.evd_generate_floor(p_profile_id uuid, p_floor_no integer, p_board_size integer default 7)
returns jsonb
language plpgsql
as $$
declare
    v_weights jsonb;
    v_counts jsonb := '{}'::jsonb;
    v_grid jsonb := '[]'::jsonb;
    v_cells text[];
    v_coord text;
    v_parts text[];
    v_row jsonb;
    v_x integer;
    v_y integer;
    v_stairs_x integer;
    v_stairs_y integer;
    v_cell_type text;
    v_cell jsonb;
    v_rule record;
    v_current_count integer;
    v_min_count integer;
    v_max_count integer;
    v_remaining_min integer := 0;
    v_force_min boolean := false;
    v_available_cells integer;
begin
    v_available_cells := (p_board_size * p_board_size) - 2;

    v_stairs_x := floor(random() * p_board_size)::integer;
    v_stairs_y := floor(random() * p_board_size)::integer;
    while v_stairs_x = 3 and v_stairs_y = 3 loop
        v_stairs_x := floor(random() * p_board_size)::integer;
        v_stairs_y := floor(random() * p_board_size)::integer;
    end loop;

    -- Base grid first; actual random tiles are assigned in randomized coordinate order.
    for v_y in 0..(p_board_size - 1) loop
        v_row := '[]'::jsonb;
        for v_x in 0..(p_board_size - 1) loop
            if v_x = 3 and v_y = 3 then
                v_cell_type := '空白';
            elsif v_x = v_stairs_x and v_y = v_stairs_y then
                v_cell_type := '下り階段';
            else
                v_cell_type := '空白';
            end if;

            v_cell := jsonb_build_object(
                'x', v_x,
                'y', v_y,
                'type', v_cell_type,
                'revealed', (v_x = 3 and v_y = 3),
                'visited', (v_x = 3 and v_y = 3),
                'resolved', (v_x = 3 and v_y = 3),
                'hint',
                    case
                        when v_cell_type in ('爆弾', '大爆発') then 'bomb'
                        when v_cell_type in ('罠', '呪い', '盗賊', '落とし穴', '転送罠') then 'hazard'
                        else null
                    end
            );
            v_row := v_row || jsonb_build_array(v_cell);
        end loop;
        v_grid := v_grid || jsonb_build_array(v_row);
    end loop;

    select array_agg(format('%s,%s', c.x, c.y) order by random())
      into v_cells
      from (
        select xg as x, yg as y
          from generate_series(0, p_board_size - 1) as xg
          cross join generate_series(0, p_board_size - 1) as yg
         where not (xg = 3 and yg = 3)
           and not (xg = v_stairs_x and yg = v_stairs_y)
      ) c;

    foreach v_coord in array coalesce(v_cells, array[]::text[]) loop
        v_parts := string_to_array(v_coord, ',');
        v_x := coalesce(v_parts[1], '0')::integer;
        v_y := coalesce(v_parts[2], '0')::integer;

        v_remaining_min := 0;
        for v_rule in
            select tile_type, min_count
              from public.evd_floor_tile_weight_profiles
             where profile_id = p_profile_id
               and floor_no = p_floor_no
               and is_enabled = true
               and tile_type <> '下り階段'
        loop
            v_current_count := coalesce((v_counts ->> v_rule.tile_type)::integer, 0);
            v_min_count := greatest(coalesce(v_rule.min_count, 0), 0);
            if v_current_count < v_min_count then
                v_remaining_min := v_remaining_min + (v_min_count - v_current_count);
            end if;
        end loop;

        v_force_min := v_remaining_min > 0;
        v_weights := '{}'::jsonb;

        for v_rule in
            select tile_type, weight, min_count, max_count
              from public.evd_floor_tile_weight_profiles
             where profile_id = p_profile_id
               and floor_no = p_floor_no
               and is_enabled = true
               and tile_type <> '下り階段'
        loop
            v_current_count := coalesce((v_counts ->> v_rule.tile_type)::integer, 0);
            v_min_count := greatest(coalesce(v_rule.min_count, 0), 0);
            v_max_count := coalesce(v_rule.max_count, v_available_cells);
            if v_max_count < v_min_count then
                v_max_count := v_min_count;
            end if;

            if v_current_count >= v_max_count then
                continue;
            end if;
            if v_force_min and v_current_count >= v_min_count then
                continue;
            end if;
            if coalesce(v_rule.weight, 0) <= 0 then
                continue;
            end if;

            v_weights := jsonb_set(
                v_weights,
                array[v_rule.tile_type],
                to_jsonb(v_rule.weight),
                true
            );
        end loop;

        if v_weights = '{}'::jsonb then
            if v_force_min then
                for v_rule in
                    select tile_type, min_count
                      from public.evd_floor_tile_weight_profiles
                     where profile_id = p_profile_id
                       and floor_no = p_floor_no
                       and is_enabled = true
                       and tile_type <> '下り階段'
                loop
                    v_current_count := coalesce((v_counts ->> v_rule.tile_type)::integer, 0);
                    v_min_count := greatest(coalesce(v_rule.min_count, 0), 0);
                    if v_current_count < v_min_count then
                        v_weights := jsonb_set(v_weights, array[v_rule.tile_type], to_jsonb(1), true);
                    end if;
                end loop;
            end if;
            if v_weights = '{}'::jsonb then
                v_weights := jsonb_build_object('空白', 1);
            end if;
        end if;

        v_cell_type := public.evd_pick_weighted(v_weights);
        v_counts := jsonb_set(
            v_counts,
            array[v_cell_type],
            to_jsonb(coalesce((v_counts ->> v_cell_type)::integer, 0) + 1),
            true
        );

        v_cell := jsonb_build_object(
            'x', v_x,
            'y', v_y,
            'type', v_cell_type,
            'revealed', false,
            'visited', false,
            'resolved', false,
            'hint',
                case
                    when v_cell_type in ('爆弾', '大爆発') then 'bomb'
                    when v_cell_type in ('罠', '呪い', '盗賊', '落とし穴', '転送罠') then 'hazard'
                    else null
                end
        );
        v_grid := public.evd_set_cell(v_grid, v_x, v_y, v_cell);
    end loop;

    return jsonb_build_object(
        'start_x', 3,
        'start_y', 3,
        'stairs_x', v_stairs_x,
        'stairs_y', v_stairs_y,
        'grid', v_grid,
        'revealed', jsonb_build_array('3,3'),
        'visited', jsonb_build_array('3,3'),
        'floor_status', '進行中'
    );
end;
$$;
create or replace function public.evd_finish_run(
    p_run_id uuid,
    p_user_id text,
    p_status text,
    p_reason text
)
returns jsonb
language plpgsql
as $$
declare
    v_run public.evd_game_runs%rowtype;
    v_payout integer;
    v_flags jsonb;
    v_carried_items jsonb;
    v_items jsonb;
    v_return_item record;
begin
    select * into v_run from public.evd_game_runs where id = p_run_id and user_id = p_user_id for update;
    if not found then
        raise exception 'ランが見つかりません';
    end if;

    v_flags := coalesce(v_run.inventory_state -> 'flags', '{}'::jsonb);
    if p_status = '帰還' then
        v_payout := floor(
            (v_run.run_coins + v_run.secured_coins)
            * v_run.final_return_multiplier
            * case when coalesce((v_flags ->> 'golden_contract_active')::boolean, false) then 2 else 1 end
        )::integer;
    elsif coalesce((v_run.inventory_state -> 'carried_items' -> 'vault_box' ->> 'quantity')::integer, 0) > 0 then
        v_payout := v_run.secured_coins + floor(v_run.run_coins * 0.8)::integer;
    elsif coalesce((v_flags ->> 'insurance_active')::boolean, false) then
        v_payout := v_run.secured_coins + floor(v_run.run_coins / 2.0)::integer;
        v_flags := jsonb_set(v_flags, array['insurance_active'], 'false'::jsonb, true);
        v_run.inventory_state := jsonb_set(v_run.inventory_state, array['flags'], v_flags, true);
    else
        v_payout := v_run.secured_coins;
    end if;

    v_carried_items := coalesce(v_run.inventory_state -> 'carried_items', '{}'::jsonb);
    v_items := coalesce(v_run.inventory_state -> 'items', '{}'::jsonb);

    if p_status = '死亡' then
        if coalesce((v_run.inventory_state -> 'carried_items' -> 'substitute_doll' ->> 'quantity')::integer, 0) > 0
           and v_run.substitute_negates_remaining < 3 then
            v_carried_items := public.evd_remove_bucket_item(jsonb_build_object('carried_items', v_carried_items), 'carried_items', 'substitute_doll', 1) -> 'carried_items';
        end if;

        if coalesce((v_run.inventory_state -> 'carried_items' -> 'insurance_token' ->> 'quantity')::integer, 0) > 0
           and not coalesce((v_flags ->> 'insurance_active')::boolean, false) then
            v_carried_items := public.evd_remove_bucket_item(jsonb_build_object('carried_items', v_carried_items), 'carried_items', 'insurance_token', 1) -> 'carried_items';
        end if;

        v_run.inventory_state := jsonb_set(v_run.inventory_state, array['carried_items'], v_carried_items, true);
    end if;

    if p_status = '帰還' then
        for v_return_item in
            select
                e.key as item_code,
                coalesce((e.value ->> 'quantity')::integer, 0) as quantity
              from jsonb_each(v_items) e
              join public.evd_item_catalog c on c.code = e.key
             where coalesce((e.value ->> 'quantity')::integer, 0) > 0
               and c.item_kind in ('手動', '死亡時', '永続')
        loop
            insert into public.evd_player_item_stocks (user_id, account_name, name, item_code, quantity, is_set, updated_at)
            values (
                p_user_id,
                v_run.account_name,
                (select c.name from public.evd_item_catalog c where c.code = v_return_item.item_code),
                v_return_item.item_code,
                v_return_item.quantity,
                false,
                now()
            )
            on conflict (user_id, item_code) do update
            set quantity = public.evd_player_item_stocks.quantity + excluded.quantity,
                account_name = excluded.account_name,
                name = excluded.name,
                updated_at = now();
        end loop;

        for v_return_item in
            select
                e.key as item_code,
                coalesce((e.value ->> 'quantity')::integer, 0) as quantity
              from jsonb_each(v_carried_items) e
              join public.evd_item_catalog c on c.code = e.key
             where coalesce((e.value ->> 'quantity')::integer, 0) > 0
               and c.item_kind in ('死亡時', '永続')
        loop
            insert into public.evd_player_item_stocks (user_id, account_name, name, item_code, quantity, is_set, updated_at)
            values (
                p_user_id,
                v_run.account_name,
                (select c.name from public.evd_item_catalog c where c.code = v_return_item.item_code),
                v_return_item.item_code,
                v_return_item.quantity,
                false,
                now()
            )
            on conflict (user_id, item_code) do update
            set quantity = public.evd_player_item_stocks.quantity + excluded.quantity,
                account_name = excluded.account_name,
                name = excluded.name,
                updated_at = now();
        end loop;
    else
        for v_return_item in
            select
                e.key as item_code,
                coalesce((e.value ->> 'quantity')::integer, 0) as quantity
              from jsonb_each(v_items) e
              join public.evd_item_catalog c on c.code = e.key
             where coalesce((e.value ->> 'quantity')::integer, 0) > 0
               and c.item_kind = '永続'
        loop
            insert into public.evd_player_item_stocks (user_id, account_name, name, item_code, quantity, is_set, updated_at)
            values (
                p_user_id,
                v_run.account_name,
                (select c.name from public.evd_item_catalog c where c.code = v_return_item.item_code),
                v_return_item.item_code,
                v_return_item.quantity,
                false,
                now()
            )
            on conflict (user_id, item_code) do update
            set quantity = public.evd_player_item_stocks.quantity + excluded.quantity,
                account_name = excluded.account_name,
                name = excluded.name,
                updated_at = now();
        end loop;

        for v_return_item in
            select
                e.key as item_code,
                coalesce((e.value ->> 'quantity')::integer, 0) as quantity
              from jsonb_each(v_carried_items) e
              join public.evd_item_catalog c on c.code = e.key
             where coalesce((e.value ->> 'quantity')::integer, 0) > 0
               and c.item_kind = '永続'
        loop
            insert into public.evd_player_item_stocks (user_id, account_name, name, item_code, quantity, is_set, updated_at)
            values (
                p_user_id,
                v_run.account_name,
                (select c.name from public.evd_item_catalog c where c.code = v_return_item.item_code),
                v_return_item.item_code,
                v_return_item.quantity,
                false,
                now()
            )
            on conflict (user_id, item_code) do update
            set quantity = public.evd_player_item_stocks.quantity + excluded.quantity,
                account_name = excluded.account_name,
                name = excluded.name,
                updated_at = now();
        end loop;
    end if;

    update public.evd_game_runs
       set status = p_status,
           death_reason = p_reason,
           result_payout = greatest(v_payout, 0),
           inventory_state = v_run.inventory_state,
           ended_at = now(),
           updated_at = now(),
           last_active_at = now(),
           version = version + 1
     where id = p_run_id;

    update public.profiles
       set coins = coalesce(coins, 0) + greatest(v_payout, 0),
           total_assets = coalesce(total_assets, 0) + greatest(v_payout, 0),
           gacha_tickets = coalesce(gacha_tickets, 0) + case when p_status = '帰還' then coalesce(v_run.gacha_tickets_gained, 0) else 0 end,
           mangan_tickets = coalesce(mangan_tickets, 0) + case when p_status = '帰還' then coalesce(v_run.mangan_tickets_gained, 0) else 0 end
     where discord_user_id = p_user_id;

    perform public.evd_add_log(
        p_run_id,
        p_user_id,
        v_run.account_name,
        v_run.current_floor,
        case when p_status = '帰還' then '帰還' else '死亡' end,
        case when p_status = '帰還'
             then format('無事に帰還して %s コイン持ち帰った。', v_payout)
             else format('%s。%s コインを持ち帰った。', p_reason, v_payout)
        end,
        jsonb_build_object('payout', v_payout)
    );

    return public.evd_build_snapshot(p_run_id, p_user_id);
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
            v_inventory := jsonb_set(v_inventory, array['flags', 'golden_contract_active'], 'true'::jsonb, true);
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
        user_id, account_name, generation_profile_id, status, life, max_life, inventory_state, substitute_negates_remaining
    )
    values (
        v_user_id,
        v_profile.account_name,
        v_profile_id,
        '進行中',
        v_max_life,
        v_max_life,
        v_inventory,
        case when coalesce((v_inventory -> 'flags' ->> 'substitute_ready')::boolean, false) then 3 else 0 end
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

    if coalesce((v_inventory -> 'items' -> 'bomb_radar' ->> 'quantity')::integer, 0) > 0 then
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
            '爆弾レーダー',
            format('爆弾レーダーが反応を示した！この階層には爆弾が %s 個あるようだ・・・', v_bomb_count),
            jsonb_build_object('bomb_count', v_bomb_count)
        );
    end if;

    return public.evd_build_snapshot(v_run_id, v_user_id);
end;
$$;
create or replace function public.evd_resolve_floor_shift(
    p_run_id uuid,
    p_user_id text,
    p_target_floor integer,
    p_status text default '進行中'
)
returns void
language plpgsql
as $$
declare
    v_run public.evd_game_runs%rowtype;
    v_floor_seed jsonb;
    v_bomb_count integer := 0;
begin
    select * into v_run from public.evd_game_runs where id = p_run_id and user_id = p_user_id for update;

    if not exists (
        select 1 from public.evd_run_floors where run_id = p_run_id and floor_no = p_target_floor
    ) then
        v_floor_seed := public.evd_generate_floor(v_run.generation_profile_id, p_target_floor, v_run.board_size);
        insert into public.evd_run_floors (
            run_id, user_id, account_name, floor_no, start_x, start_y, stairs_x, stairs_y, grid, revealed, visited, floor_status
        )
        values (
            p_run_id,
            p_user_id,
            v_run.account_name,
            p_target_floor,
            (v_floor_seed ->> 'start_x')::integer,
            (v_floor_seed ->> 'start_y')::integer,
            (v_floor_seed ->> 'stairs_x')::integer,
            (v_floor_seed ->> 'stairs_y')::integer,
            v_floor_seed -> 'grid',
            v_floor_seed -> 'revealed',
            v_floor_seed -> 'visited',
            p_status
        );
    end if;

    update public.evd_game_runs
       set current_floor = p_target_floor,
           current_x = 3,
           current_y = 3,
           inventory_state = jsonb_set(
                jsonb_set(
                    jsonb_set(
                        jsonb_set(inventory_state, array['flags', 'stairs_known'], 'false'::jsonb, true),
                        array['flags', 'hazards_known'], 'false'::jsonb, true
                    ),
                    array['flags', 'bombs_known'], 'false'::jsonb, true
                ),
                array['pending_resolution'], 'null'::jsonb, true
           ),
           updated_at = now(),
           last_active_at = now(),
           version = version + 1
     where id = p_run_id;

    if coalesce((v_run.inventory_state -> 'items' -> 'bomb_radar' ->> 'quantity')::integer, 0) > 0 then
        select count(*)
          into v_bomb_count
          from public.evd_run_floors f
          cross join jsonb_array_elements(f.grid) as row_cells(cell_row)
          cross join jsonb_array_elements(row_cells.cell_row) as cell(cell_item)
         where f.run_id = p_run_id
           and f.floor_no = p_target_floor
           and cell.cell_item ->> 'type' in ('爆弾', '大爆発');

        perform public.evd_add_log(
            p_run_id,
            p_user_id,
            v_run.account_name,
            p_target_floor,
            '爆弾レーダー',
            format('爆弾レーダーが反応を示した！この階層には爆弾が %s 個あるようだ・・・', v_bomb_count),
            jsonb_build_object('bomb_count', v_bomb_count)
        );
    end if;
end;
$$;
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
                   set inventory_state = jsonb_set(inventory_state, array['flags', 'insurance_active'], 'true'::jsonb, true)
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
            v_message := format('身代わり人形が砕け、%s を無効化した。あと %s 回。', v_cell ->> 'type', greatest(v_run.substitute_negates_remaining - 1, 0));
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
            v_message := format('身代わり人形が砕け、%s を無効化した。あと %s 回。', v_cell ->> 'type', greatest(v_run.substitute_negates_remaining - 1, 0));
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

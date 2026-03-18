alter table public.evd_item_catalog
drop column if exists max_stack;

alter table public.evd_player_item_stocks
add column if not exists is_set boolean not null default false;

insert into public.evd_item_catalog (code, name, description, item_kind, shop_pool, carry_in_allowed, base_price, effect_data, sort_order, weight)
values
    ('insurance_token', '保険札', '死亡時にそのランの所持コイン半分を持ち帰る。', '死亡時', '通常', true, 260, '{"effect":"insurance"}', 40, 6),
    ('vault_box', '不滅証書', '死亡時に所持コインの 80% を持ち帰る。', '死亡時', '限定', true, 740, '{"effect":"vault_box","rate":0.8}', 120, 2),
    ('giant_cup', '巨人の盃', '所持しているだけで最大LIFEが 1 増える。重複しても効果は 1 回のみ。', '永続', 'レリック', false, 1200, '{"effect":"relic_max_life_plus_1"}', 130, 0),
    ('greedy_bag', '強欲の鞄', '所持しているだけで持ち込めるアイテム数が 1 増える。', '永続', 'レリック', false, 1400, '{"effect":"relic_carry_limit_plus_1"}', 140, 0)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    item_kind = excluded.item_kind,
    shop_pool = excluded.shop_pool,
    carry_in_allowed = excluded.carry_in_allowed,
    base_price = excluded.base_price,
    effect_data = excluded.effect_data,
    sort_order = excluded.sort_order,
    weight = excluded.weight;

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

create or replace function public.evd_set_stock_item_set(p_item_code text, p_is_set boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id text := public.evd_current_user_id();
    v_profile record;
    v_item record;
    v_stocks jsonb;
begin
    if v_user_id = '' then
        raise exception 'ログインが必要です';
    end if;

    perform pg_advisory_xact_lock(hashtext('evd:' || v_user_id));

    select account_name
      into v_profile
      from public.profiles
     where discord_user_id = v_user_id;

    if not found then
        raise exception 'プロフィールが見つかりません';
    end if;

    select code, name, carry_in_allowed, is_active
      into v_item
      from public.evd_item_catalog
     where code = p_item_code;

    if not found or not v_item.is_active then
        raise exception '対象アイテムが見つかりません';
    end if;

    if not coalesce(v_item.carry_in_allowed, false) then
        raise exception '持ち込み設定できないアイテムです';
    end if;

    update public.evd_player_item_stocks
       set is_set = p_is_set,
           account_name = v_profile.account_name,
           updated_at = now()
     where user_id = v_user_id
       and item_code = p_item_code
       and quantity > 0;

    if not found then
        raise exception '在庫がありません';
    end if;

    select coalesce(jsonb_agg(to_jsonb(s) order by sort_order), '[]'::jsonb)
      into v_stocks
      from (
        select
            st.item_code,
            st.is_set,
            st.quantity,
            st.updated_at,
            jsonb_build_object(
                'name', c.name,
                'description', c.description,
                'item_kind', c.item_kind,
                'base_price', c.base_price,
                'carry_in_allowed', c.carry_in_allowed,
                'shop_pool', c.shop_pool,
                'sort_order', c.sort_order
            ) as evd_item_catalog,
            c.sort_order
        from public.evd_player_item_stocks st
        join public.evd_item_catalog c on c.code = st.item_code
        where st.user_id = v_user_id
          and st.quantity > 0
      ) s;

    return jsonb_build_object(
        'stocks', v_stocks
    );
end;
$$;

create or replace function public.evd_buy_stock_item(p_item_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id text := public.evd_current_user_id();
    v_profile record;
    v_item record;
    v_stocks jsonb;
begin
    if v_user_id = '' then
        raise exception 'ログインが必要です';
    end if;

    perform pg_advisory_xact_lock(hashtext('evd:' || v_user_id));

    select coins, total_assets, gacha_tickets, mangan_tickets, account_name
      into v_profile
      from public.profiles
     where discord_user_id = v_user_id
     for update;

    if not found then
        raise exception 'プロフィールが見つかりません';
    end if;

    select code, name, description, base_price, shop_pool, is_active
      into v_item
      from public.evd_item_catalog
     where code = p_item_code;

    if not found or not v_item.is_active or v_item.shop_pool not in ('通常', '両方', 'レリック') then
        raise exception '購入できないアイテムです';
    end if;

    if coalesce(v_profile.coins, 0) < v_item.base_price then
        raise exception 'コインが足りません';
    end if;

    update public.profiles
       set coins = coins - v_item.base_price
     where discord_user_id = v_user_id;

    insert into public.evd_player_item_stocks (user_id, account_name, name, item_code, quantity, is_set, updated_at)
    values (v_user_id, v_profile.account_name, v_item.name, p_item_code, 1, false, now())
    on conflict (user_id, item_code) do update
    set quantity = public.evd_player_item_stocks.quantity + 1,
        account_name = excluded.account_name,
        name = excluded.name,
        updated_at = now();

    select coins, total_assets, gacha_tickets, mangan_tickets, account_name
      into v_profile
      from public.profiles
     where discord_user_id = v_user_id;

    select coalesce(jsonb_agg(to_jsonb(s) order by sort_order), '[]'::jsonb)
      into v_stocks
      from (
        select
            st.item_code,
            st.is_set,
            st.quantity,
            st.updated_at,
            jsonb_build_object(
                'name', c.name,
                'description', c.description,
                'item_kind', c.item_kind,
                'base_price', c.base_price,
                'carry_in_allowed', c.carry_in_allowed,
                'shop_pool', c.shop_pool,
                'sort_order', c.sort_order
            ) as evd_item_catalog,
            c.sort_order
        from public.evd_player_item_stocks st
        join public.evd_item_catalog c on c.code = st.item_code
        where st.user_id = v_user_id
          and st.quantity > 0
      ) s;

    return jsonb_build_object(
        'message', format('%s を購入して在庫に追加した。', v_item.name),
        'profile', to_jsonb(v_profile),
        'stocks', v_stocks
    );
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
            v_inventory := jsonb_set(v_inventory, array['flags', 'golden_contract_active'], 'true'::jsonb, true);
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

    if coalesce(v_run.inventory_state -> 'pending_thief', 'null'::jsonb) <> 'null'::jsonb then
        raise exception '盗賊への対応を先に完了してください';
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
                   set substitute_negates_remaining = substitute_negates_remaining + 3,
                       inventory_state = public.evd_add_bucket_item(inventory_state, 'carried_items', v_pick_item_code, 1)
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
            update public.evd_game_runs
               set inventory_state = jsonb_set(
                    inventory_state,
                    array['pending_thief'],
                    jsonb_build_object('ransom', v_ransom),
                    true
               )
             where id = p_run_id;
            return public.evd_build_snapshot(p_run_id, v_user_id);
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
            v_message := case
                when v_run.current_floor >= v_run.max_floors then '深部の祭壇を見つけた。'
                else '下り階段を見つけた。'
            end;
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

create or replace function public.evd_resolve_stairs(p_run_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id text := public.evd_current_user_id();
    v_run public.evd_game_runs%rowtype;
    v_floor public.evd_run_floors%rowtype;
    v_current_cell jsonb;
    v_bonus integer := 0;
    v_target_floor integer;
    v_offers jsonb;
begin
    perform pg_advisory_xact_lock(hashtext('evd:' || v_user_id));

    select * into v_run from public.evd_game_runs where id = p_run_id and user_id = v_user_id and status = '進行中' for update;
    if not found then
        raise exception '進行中のランが見つかりません';
    end if;

    select * into v_floor
      from public.evd_run_floors
     where run_id = p_run_id
       and floor_no = v_run.current_floor;

    v_current_cell := public.evd_get_cell(v_floor.grid, v_run.current_x, v_run.current_y);
    if coalesce(v_current_cell ->> 'type', '') <> '下り階段' then
        raise exception '階段の上にいないため選択できません';
    end if;

    if v_run.current_floor >= v_run.max_floors then
        if p_action <> 'return' then
            raise exception '深部の祭壇では帰還のみ選択できます';
        end if;

        with relic_pool as (
            select
                c.code,
                c.name,
                c.description,
                c.sort_order,
                greatest(coalesce(c.weight, 0), 1) as effective_weight
              from public.evd_item_catalog c
             where c.is_active = true
               and c.shop_pool = 'レリック'
        )
        select coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'code', picked.code,
                    'name', picked.name,
                    'description', picked.description
                )
                order by picked.sort_order, picked.code
            ),
            '[]'::jsonb
        )
          into v_offers
          from (
            select code, name, description, sort_order
              from relic_pool
             order by -ln(greatest(random(), 1e-9)) / effective_weight
             limit 2
          ) picked;

        if coalesce(jsonb_array_length(v_offers), 0) = 0 then
            perform public.evd_add_log(p_run_id, v_user_id, v_run.account_name, v_run.current_floor, '帰還', '深部の祭壇を後にして地上へ引き返した。');
            return public.evd_finish_run(p_run_id, v_user_id, '帰還', '深部の祭壇から帰還');
        end if;

        update public.evd_game_runs
           set inventory_state = jsonb_set(inventory_state, array['pending_altar_reward'], jsonb_build_object('offers', v_offers), true)
         where id = p_run_id;

        perform public.evd_add_log(
            p_run_id,
            v_user_id,
            v_run.account_name,
            v_run.current_floor,
            '祭壇報酬',
            '深部の祭壇が輝き、レリックを 1 つ選べるようになった。',
            jsonb_build_object('offers', v_offers)
        );

        return public.evd_build_snapshot(p_run_id, v_user_id);
    end if;

    if p_action = 'return' then
        perform public.evd_add_log(p_run_id, v_user_id, v_run.account_name, v_run.current_floor, '帰還', '階段から地上へ引き返した。');
        return public.evd_finish_run(p_run_id, v_user_id, '帰還', '地上へ帰還');
    end if;

    v_target_floor := v_run.current_floor + 1;
    select coalesce(fbp.bonus_coins, 0)
      into v_bonus
      from public.evd_floor_bonus_profiles fbp
     where fbp.profile_id = v_run.generation_profile_id
       and fbp.floor_no = v_target_floor;

    v_bonus := coalesce(v_bonus, 0);

    update public.evd_game_runs
       set run_coins = run_coins + v_bonus,
           floor_bonus_total = floor_bonus_total + v_bonus
     where id = p_run_id;

    perform public.evd_resolve_floor_shift(p_run_id, v_user_id, v_target_floor, '進行中');
    perform public.evd_add_log(p_run_id, v_user_id, v_run.account_name, v_target_floor, '次階層へ進行', format('%s 階へ進み、到達ボーナス %s コイン獲得した。', v_target_floor, v_bonus));

    return public.evd_build_snapshot(p_run_id, v_user_id);
end;
$$;

create or replace function public.evd_claim_altar_reward(p_run_id uuid, p_item_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id text := public.evd_current_user_id();
    v_run public.evd_game_runs%rowtype;
    v_pending jsonb;
    v_offer jsonb;
    v_item record;
begin
    if v_user_id = '' then
        raise exception 'ログインが必要です';
    end if;

    perform pg_advisory_xact_lock(hashtext('evd:' || v_user_id));

    select * into v_run
      from public.evd_game_runs
     where id = p_run_id
       and user_id = v_user_id
       and status = '進行中'
     for update;
    if not found then
        raise exception '進行中のランが見つかりません';
    end if;

    v_pending := coalesce(v_run.inventory_state -> 'pending_altar_reward', 'null'::jsonb);
    if v_pending = 'null'::jsonb then
        raise exception '受け取れる祭壇報酬がありません';
    end if;

    select value
      into v_offer
      from jsonb_array_elements(coalesce(v_pending -> 'offers', '[]'::jsonb)) value
     where value ->> 'code' = p_item_code
     limit 1;

    if v_offer is null then
        raise exception '提示されたレリックから選択してください';
    end if;

    select code, name
      into v_item
      from public.evd_item_catalog
     where code = p_item_code
       and is_active = true
       and shop_pool = 'レリック';

    if not found then
        raise exception '受け取れないレリックです';
    end if;

    insert into public.evd_player_item_stocks (user_id, account_name, name, item_code, quantity, is_set, updated_at)
    values (v_user_id, v_run.account_name, v_item.name, p_item_code, 1, false, now())
    on conflict (user_id, item_code) do update
    set quantity = public.evd_player_item_stocks.quantity + 1,
        account_name = excluded.account_name,
        name = excluded.name,
        updated_at = now();

    update public.evd_game_runs
       set inventory_state = inventory_state - 'pending_altar_reward'
     where id = p_run_id;

    perform public.evd_add_log(
        p_run_id,
        v_user_id,
        v_run.account_name,
        v_run.current_floor,
        '祭壇報酬',
        format('深部の祭壇から %s を授かった。', v_item.name),
        jsonb_build_object('item_code', p_item_code, 'item_name', v_item.name)
    );

    return public.evd_finish_run(p_run_id, v_user_id, '帰還', '深部の祭壇から帰還');
end;
$$;

create or replace function public.evd_resolve_thief(p_run_id uuid, p_action text)
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
    v_pending jsonb;
    v_ransom integer := 0;
    v_message text := '';
    v_item_to_lose text;
    v_item_to_lose_name text;
    v_escape_failed boolean := false;
begin
    if v_user_id = '' then
        raise exception 'ログインが必要です';
    end if;

    perform pg_advisory_xact_lock(hashtext('evd:' || v_user_id));

    select * into v_run
      from public.evd_game_runs
     where id = p_run_id
       and user_id = v_user_id
       and status = '進行中'
     for update;
    if not found then
        raise exception '進行中のランが見つかりません';
    end if;

    v_pending := coalesce(v_run.inventory_state -> 'pending_thief', 'null'::jsonb);
    if v_pending = 'null'::jsonb then
        raise exception '解決待ちの盗賊イベントはありません';
    end if;

    select * into v_floor
      from public.evd_run_floors
     where run_id = p_run_id
       and floor_no = v_run.current_floor
     for update;

    v_grid := v_floor.grid;
    v_cell := public.evd_get_cell(v_grid, v_run.current_x, v_run.current_y);
    if coalesce(v_cell ->> 'type', '') <> '盗賊' then
        raise exception '盗賊マス上でのみ実行できます';
    end if;

    v_ransom := greatest(coalesce((v_pending ->> 'ransom')::integer, 150), 0);

    case p_action
        when 'item' then
            select e.key, c.name
              into v_item_to_lose, v_item_to_lose_name
              from jsonb_each(coalesce(v_run.inventory_state -> 'items', '{}'::jsonb)) e
              left join public.evd_item_catalog c
                on c.code = e.key
             where coalesce((e.value ->> 'quantity')::integer, 0) > 0
             order by random()
             limit 1;

            if v_item_to_lose is null then
                raise exception 'アイテムを持っていない';
            end if;

            update public.evd_game_runs
               set inventory_state = public.evd_remove_bucket_item(
                    public.evd_remove_item(inventory_state - 'pending_thief', v_item_to_lose, 1),
                    'carried_items',
                    v_item_to_lose,
                    1
               )
             where id = p_run_id;

            v_message := format('盗賊へ %s を差し出した。', coalesce(v_item_to_lose_name, v_item_to_lose));
        when 'coin' then
            if v_run.run_coins < v_ransom then
                raise exception '所持金が足りない';
            end if;

            update public.evd_game_runs
               set run_coins = run_coins - v_ransom,
                   inventory_state = inventory_state - 'pending_thief'
             where id = p_run_id;

            v_message := format('盗賊へ %s コイン差し出した。', v_ransom);
        when 'escape' then
            if random() < 0.7 then
                update public.evd_game_runs
                   set inventory_state = inventory_state - 'pending_thief'
                 where id = p_run_id;

                v_message := '盗賊から逃げ切った。何も起こらなかった。';
            else
                update public.evd_game_runs
                   set life = 0,
                       inventory_state = inventory_state - 'pending_thief'
                 where id = p_run_id;

                v_message := '盗賊から逃げようとしたが、返り討ちに遭って死亡した。';
                v_escape_failed := true;
            end if;
        else
            raise exception '不正な選択です';
    end case;

    v_cell := jsonb_set(v_cell, array['resolved'], 'true'::jsonb, true);
    v_grid := public.evd_set_cell(v_grid, v_run.current_x, v_run.current_y, v_cell);
    update public.evd_run_floors
       set grid = v_grid
     where id = v_floor.id;

    perform public.evd_add_log(
        p_run_id,
        v_user_id,
        v_run.account_name,
        v_run.current_floor,
        'マス公開',
        v_message,
        jsonb_build_object('tile_type', '盗賊', 'thief_action', p_action)
    );

    if v_escape_failed then
        return public.evd_finish_run(p_run_id, v_user_id, '死亡', '盗賊から逃げようとして返り討ちに遭った');
    end if;

    return public.evd_build_snapshot(p_run_id, v_user_id);
end;
$$;

create or replace function public.evd_shop_purchase(p_run_id uuid, p_item_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id text := public.evd_current_user_id();
    v_run public.evd_game_runs%rowtype;
    v_pending jsonb;
    v_offer jsonb;
    v_effect text;
    v_price integer;
begin
    perform pg_advisory_xact_lock(hashtext('evd:' || v_user_id));

    select * into v_run from public.evd_game_runs where id = p_run_id and user_id = v_user_id and status = '進行中' for update;
    if not found then
        raise exception '進行中のランが見つかりません';
    end if;

    v_pending := v_run.inventory_state -> 'pending_shop';
    if v_pending is null or v_pending = 'null'::jsonb then
        raise exception '利用できるショップがありません';
    end if;

    if p_item_code is null then
        update public.evd_game_runs
           set inventory_state = jsonb_set(inventory_state, array['pending_shop'], 'null'::jsonb, true),
               updated_at = now(),
               last_active_at = now(),
               version = version + 1
         where id = p_run_id;
        perform public.evd_add_log(p_run_id, v_user_id, v_run.account_name, v_run.current_floor, 'ショップ購入', '何も買わず立ち去った。');
        return public.evd_build_snapshot(p_run_id, v_user_id);
    end if;

    select item
      into v_offer
      from jsonb_array_elements(v_pending -> 'offers') as item
     where item ->> 'code' = p_item_code
     limit 1;

    if v_offer is null then
        raise exception 'その商品はありません';
    end if;

    v_price := (v_offer ->> 'price')::integer;
    if v_run.run_coins < v_price then
        raise exception 'コインが足りません';
    end if;

    update public.evd_game_runs
       set run_coins = run_coins - v_price,
           inventory_state = jsonb_set(inventory_state, array['pending_shop'], 'null'::jsonb, true),
           updated_at = now(),
           last_active_at = now(),
           version = version + 1
     where id = p_run_id;

    select effect_data ->> 'effect' into v_effect from public.evd_item_catalog where code = p_item_code;

    if v_effect = 'substitute' then
        update public.evd_game_runs
           set substitute_negates_remaining = substitute_negates_remaining + 3,
               inventory_state = public.evd_add_bucket_item(inventory_state, 'carried_items', p_item_code, 1)
         where id = p_run_id;
    elsif v_effect = 'insurance' then
        update public.evd_game_runs
           set inventory_state = public.evd_add_bucket_item(
                jsonb_set(inventory_state, array['flags', 'insurance_active'], 'true'::jsonb, true),
                'carried_items',
                p_item_code,
                1
           )
         where id = p_run_id;
    elsif v_effect = 'golden_contract' then
        update public.evd_game_runs set inventory_state = jsonb_set(inventory_state, array['flags', 'golden_contract_active'], 'true'::jsonb, true) where id = p_run_id;
    elsif v_effect = 'vault_box' then
        update public.evd_game_runs
           set inventory_state = public.evd_add_bucket_item(inventory_state, 'carried_items', p_item_code, 1)
         where id = p_run_id;
    else
        update public.evd_game_runs set inventory_state = public.evd_add_item(inventory_state, p_item_code, 1) where id = p_run_id;
    end if;

    perform public.evd_add_log(
        p_run_id,
        v_user_id,
        v_run.account_name,
        v_run.current_floor,
        case when coalesce(v_pending ->> 'shop_type', 'ショップ') = '限定ショップ' then '限定ショップ購入' else 'ショップ購入' end,
        format('%s を %s コインで購入した。', v_offer ->> 'name', v_price),
        jsonb_build_object('item_code', p_item_code, 'price', v_price)
    );

    return public.evd_build_snapshot(p_run_id, v_user_id);
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
        v_run.gacha_tickets_gained := 0;
        v_run.mangan_tickets_gained := 0;
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
           gacha_tickets_gained = v_run.gacha_tickets_gained,
           mangan_tickets_gained = v_run.mangan_tickets_gained,
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

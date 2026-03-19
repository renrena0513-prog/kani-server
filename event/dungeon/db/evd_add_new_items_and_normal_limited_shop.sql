begin;

insert into public.evd_item_catalog (
    code, name, description, item_kind, shop_pool, carry_in_allowed, base_price, effect_data, sort_order, weight, rarity
)
values
    ('super_healing_potion', '上級回復ポーション', '❤を2回復する', '手動', '通常', true, 300, '{"effect":"heal_hp","amount":2}', 35, 8, 'ノーマル'),
    ('return_blessing', '帰還加護', '帰還時に帰還倍率が上昇する', '自動', '通常限定', true, 300, '{"effect":"return_multiplier_bonus_on_escape","amount":1.3}', 145, 6, 'ノーマル'),
    ('thief_ward_charm', '盗賊避けの護符', '盗賊から一度だけ確実に逃げられる', '自動', '通常限定', true, 100, '{"effect":"guaranteed_escape_from_thief"}', 146, 6, 'ノーマル'),
    ('revival_charm', '復活の護符', '死亡時に一度だけ❤1で復活する', '自動', '通常限定', true, 300, '{"effect":"revive_on_death","revive_hp":1}', 147, 5, 'ノーマル'),
    ('life_vessel', '命の器', '最大❤を1増やす', '手動', '通常限定', true, 300, '{"effect":"increase_max_hp","amount":1}', 148, 6, 'ノーマル'),
    ('regeneration_charm', '再生の護符', '階層を進むたびに❤を1回復する', '自動', '限定', true, 500, '{"effect":"heal_hp_on_floor_advance","amount":1}', 149, 3, 'レア'),
    ('lucky_coin', '招き銭', '小銭を拾うたびに追加で10coin獲得する', '自動', '通常限定', true, 60, '{"effect":"add_coin_on_coin_pickup","amount":10}', 151, 8, 'ノーマル')
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    item_kind = excluded.item_kind,
    shop_pool = excluded.shop_pool,
    carry_in_allowed = excluded.carry_in_allowed,
    base_price = excluded.base_price,
    effect_data = excluded.effect_data,
    sort_order = excluded.sort_order,
    weight = excluded.weight,
    rarity = excluded.rarity;

create or replace function public.evd_generate_shop_offers(p_run_id uuid, p_shop_type text)
returns jsonb
language sql
as $$
    with run_context as (
        select current_floor, generation_profile_id
          from public.evd_game_runs
         where id = p_run_id
           and user_id = public.evd_current_user_id()
           and status = '進行中'
    ),
    floor_pricing as (
        select coalesce(fbp.shop_price_multiplier, 1.00::numeric) as multiplier
          from run_context rc
          left join public.evd_floor_bonus_profiles fbp
            on fbp.profile_id = rc.generation_profile_id
           and fbp.floor_no = rc.current_floor
    ),
    merchant_discount as (
        select least(coalesce(sum(st.quantity), 0), 4) * 0.05 as rate
          from public.evd_player_item_stocks st
          join public.evd_item_catalog c
            on c.code = st.item_code
         where st.user_id = public.evd_current_user_id()
           and st.quantity > 0
           and c.is_active = true
           and c.effect_data ->> 'effect' = 'relic_shop_discount_plus_5pct'
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'code', code,
        'name', name,
        'description', description,
        'price', price,
        'rarity', rarity
    )), '[]'::jsonb)
    from (
        select
            code,
            name,
            description,
            floor(
                base_price
                * coalesce((select multiplier from floor_pricing), 1.00::numeric)
                * greatest(0::numeric, 1 - coalesce((select rate from merchant_discount), 0))
            )::integer as price,
            rarity
          from public.evd_item_catalog
         where is_active = true
           and (
                (p_shop_type = 'ショップ' and shop_pool in ('通常', '両方', '通常限定'))
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
            perform public.evd_add_log(p_run_id, v_user_id, v_run.account_name, v_run.current_floor, 'アイテム使用', '厄災の地図で危険マスを可視化した。');
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
            select coalesce(sum(fbp.bonus_coins), 0)
              into v_bonus_sum
              from public.evd_floor_bonus_profiles fbp
             where fbp.profile_id = v_run.generation_profile_id
               and fbp.floor_no > v_run.current_floor
               and fbp.floor_no <= least(v_run.current_floor + 3, v_run.max_floors);

            update public.evd_game_runs
               set run_coins = run_coins + v_bonus_sum,
                   floor_bonus_total = floor_bonus_total + v_bonus_sum
             where id = p_run_id;

            perform public.evd_resolve_floor_shift(p_run_id, v_user_id, least(v_run.current_floor + 3, v_run.max_floors), '進行中');
            perform public.evd_add_log(p_run_id, v_user_id, v_run.account_name, least(v_run.current_floor + 3, v_run.max_floors), 'アイテム使用', format('奈落直通札で %s 階層先へ進み、到達ボーナス %s コインを得た。', least(3, v_run.max_floors - v_run.current_floor), v_bonus_sum));
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
    v_has_doom_eye boolean := false;
    v_floor_heal integer := 0;
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

    select coalesce(sum(coalesce((e.value ->> 'quantity')::integer, 0) * coalesce((c.effect_data ->> 'amount')::integer, 0)), 0)
      into v_floor_heal
      from public.evd_game_runs gr
      cross join jsonb_each(coalesce(gr.inventory_state -> 'items', '{}'::jsonb)) e
      join public.evd_item_catalog c
        on c.code = e.key
     where gr.id = p_run_id
       and coalesce((e.value ->> 'quantity')::integer, 0) > 0
       and c.effect_data ->> 'effect' = 'heal_hp_on_floor_advance';

    if coalesce(v_floor_heal, 0) > 0 then
        update public.evd_game_runs
           set life = least(max_life, life + v_floor_heal),
               updated_at = now(),
               last_active_at = now(),
               version = version + 1
         where id = p_run_id;

        perform public.evd_add_log(
            p_run_id,
            p_user_id,
            v_run.account_name,
            p_target_floor,
            '自動発動',
            format('再生の護符の力でライフを %s 回復した。', v_floor_heal),
            jsonb_build_object('effect', 'heal_hp_on_floor_advance', 'amount', v_floor_heal)
        );
    end if;

    select exists (
        select 1
          from public.evd_player_item_stocks st
          join public.evd_item_catalog c on c.code = st.item_code
         where st.user_id = p_user_id
           and st.quantity > 0
           and c.is_active = true
           and c.effect_data ->> 'effect' = 'relic_bomb_radar_always'
    )
      into v_has_doom_eye;

    if coalesce((v_run.inventory_state -> 'items' -> 'bomb_radar' ->> 'quantity')::integer, 0) > 0 or v_has_doom_eye then
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
            case when v_has_doom_eye then 'レリック効果' else '爆弾レーダー' end,
            case when v_has_doom_eye
                 then format('破滅の魔眼がこの階層の爆弾を暴いた。爆弾は %s 個あるようだ・・・', v_bomb_count)
                 else format('爆弾レーダーが反応を示した！この階層には爆弾が %s 個あるようだ・・・', v_bomb_count)
            end,
            jsonb_build_object('bomb_count', v_bomb_count, 'effect', case when v_has_doom_eye then 'relic_bomb_radar_always' else 'bomb_radar' end)
        );
    end if;
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
    v_escape_chance numeric(6, 4) := 0.70;
    v_revive_hp integer := 1;
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

    select v_escape_chance + least(coalesce(sum(st.quantity), 0), 2) * 0.05
      into v_escape_chance
      from public.evd_player_item_stocks st
      join public.evd_item_catalog c
        on c.code = st.item_code
     where st.user_id = v_user_id
       and st.quantity > 0
       and c.is_active = true
       and c.effect_data ->> 'effect' = 'relic_thief_escape_plus_5pct';

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

            if v_run.substitute_negates_remaining > 0 then
                update public.evd_game_runs
                   set substitute_negates_remaining = substitute_negates_remaining - 1,
                       inventory_state = inventory_state - 'pending_thief'
                 where id = p_run_id;
                v_message := format('身代わり人形が砕け、盗賊への差し出しを無効化した。あと %s 回。', greatest(v_run.substitute_negates_remaining - 1, 0));
            else
                update public.evd_game_runs
                   set inventory_state = public.evd_remove_bucket_item(
                        public.evd_remove_item(inventory_state - 'pending_thief', v_item_to_lose, 1),
                        'carried_items',
                        v_item_to_lose,
                        1
                   )
                 where id = p_run_id;

                v_message := format('盗賊へ %s を差し出した。', coalesce(v_item_to_lose_name, v_item_to_lose));
            end if;
        when 'coin' then
            if v_run.run_coins < v_ransom then
                raise exception '所持金が足りない';
            end if;

            if v_run.substitute_negates_remaining > 0 then
                update public.evd_game_runs
                   set substitute_negates_remaining = substitute_negates_remaining - 1,
                       inventory_state = inventory_state - 'pending_thief'
                 where id = p_run_id;
                v_message := format('身代わり人形が砕け、盗賊への支払いを無効化した。あと %s 回。', greatest(v_run.substitute_negates_remaining - 1, 0));
            else
                update public.evd_game_runs
                   set run_coins = run_coins - v_ransom,
                       inventory_state = inventory_state - 'pending_thief'
                 where id = p_run_id;

                v_message := format('盗賊へ %s コイン差し出した。', v_ransom);
            end if;
        when 'escape' then
            if coalesce((v_run.inventory_state -> 'items' -> 'thief_ward_charm' ->> 'quantity')::integer, 0) > 0 then
                update public.evd_game_runs
                   set inventory_state = public.evd_remove_item(inventory_state - 'pending_thief', 'thief_ward_charm', 1)
                 where id = p_run_id;

                v_message := '盗賊避けの護符が砕け、盗賊から確実に逃げ切った。';
            elsif random() < v_escape_chance then
                update public.evd_game_runs
                   set inventory_state = inventory_state - 'pending_thief'
                 where id = p_run_id;

                v_message := '盗賊から逃げ切った。何も起こらなかった。';
            else
                if v_run.substitute_negates_remaining > 0 then
                    update public.evd_game_runs
                       set substitute_negates_remaining = substitute_negates_remaining - 1,
                           inventory_state = inventory_state - 'pending_thief'
                     where id = p_run_id;
                    v_message := format('身代わり人形が砕け、盗賊の返り討ちを無効化した。あと %s 回。', greatest(v_run.substitute_negates_remaining - 1, 0));
                else
                    update public.evd_game_runs
                       set life = 0,
                           inventory_state = inventory_state - 'pending_thief'
                     where id = p_run_id;

                    v_message := '盗賊から逃げようとしたが、返り討ちに遭って死亡した。';
                    v_escape_failed := true;
                end if;
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
        if coalesce((v_run.inventory_state -> 'items' -> 'revival_charm' ->> 'quantity')::integer, 0) > 0 then
            select coalesce((effect_data ->> 'revive_hp')::integer, 1)
              into v_revive_hp
              from public.evd_item_catalog
             where code = 'revival_charm';

            update public.evd_game_runs
               set life = greatest(v_revive_hp, 1),
                   inventory_state = public.evd_remove_item(inventory_state, 'revival_charm', 1),
                   updated_at = now(),
                   last_active_at = now(),
                   version = version + 1
             where id = p_run_id;

            perform public.evd_add_log(
                p_run_id,
                v_user_id,
                v_run.account_name,
                v_run.current_floor,
                '自動発動',
                format('復活の護符が砕け、ライフ %s で復活した。', greatest(v_revive_hp, 1)),
                jsonb_build_object('effect', 'revive_on_death', 'item_code', 'revival_charm')
            );

            return public.evd_build_snapshot(p_run_id, v_user_id);
        end if;

        return public.evd_finish_run(p_run_id, v_user_id, '死亡', '盗賊から逃げようとして返り討ちに遭った');
    end if;

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
    v_wallet_bonus numeric(8, 2) := 0.0;
    v_base_death_rate numeric(8, 2) := 0.0;
    v_death_return_rate numeric(8, 2) := 0.0;
    v_has_coffin boolean := false;
    v_escape_bonus_multiplier numeric(10, 4) := 1.0;
begin
    select * into v_run from public.evd_game_runs where id = p_run_id and user_id = p_user_id for update;
    if not found then
        raise exception 'ランが見つかりません';
    end if;

    v_flags := coalesce(v_run.inventory_state -> 'flags', '{}'::jsonb);
    v_items := coalesce(v_run.inventory_state -> 'items', '{}'::jsonb);
    if p_status = '帰還' then
        select coalesce(exp(sum(ln(coalesce((c.effect_data ->> 'amount')::numeric, 1.0)))), 1.0)
          into v_escape_bonus_multiplier
          from jsonb_each(v_items) e
          join public.evd_item_catalog c
            on c.code = e.key
         where coalesce((e.value ->> 'quantity')::integer, 0) > 0
           and c.effect_data ->> 'effect' = 'return_multiplier_bonus_on_escape'
           and coalesce((c.effect_data ->> 'amount')::numeric, 1.0) > 0;

        v_payout := floor(
            (v_run.run_coins + v_run.secured_coins)
            * v_run.final_return_multiplier
            * coalesce(v_escape_bonus_multiplier, 1.0)
            * case when coalesce((v_flags ->> 'golden_contract_active')::boolean, false) then 2 else 1 end
        )::integer;
    else
        select least(coalesce(sum(st.quantity), 0), 5) * 0.02
          into v_wallet_bonus
          from public.evd_player_item_stocks st
          join public.evd_item_catalog c
            on c.code = st.item_code
         where st.user_id = p_user_id
           and st.quantity > 0
           and c.is_active = true
           and c.effect_data ->> 'effect' = 'relic_death_coin_keep_plus_2pct';

        select exists (
            select 1
              from public.evd_player_item_stocks st
              join public.evd_item_catalog c on c.code = st.item_code
             where st.user_id = p_user_id
               and st.quantity > 0
               and c.is_active = true
               and c.effect_data ->> 'effect' = 'relic_keep_unused_manual_on_death'
        )
          into v_has_coffin;

        if coalesce((v_run.inventory_state -> 'carried_items' -> 'vault_box' ->> 'quantity')::integer, 0) > 0 then
            v_base_death_rate := 0.80;
        elsif coalesce((v_flags ->> 'insurance_active')::boolean, false) then
            v_base_death_rate := 0.50;
            v_flags := jsonb_set(v_flags, array['insurance_active'], 'false'::jsonb, true);
            v_run.inventory_state := jsonb_set(v_run.inventory_state, array['flags'], v_flags, true);
        end if;

        v_death_return_rate := least(1.0, coalesce(v_base_death_rate, 0) + coalesce(v_wallet_bonus, 0));
        v_payout := v_run.secured_coins + floor(v_run.run_coins * v_death_return_rate)::integer;
    end if;

    v_carried_items := coalesce(v_run.inventory_state -> 'carried_items', '{}'::jsonb);

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
        if v_has_coffin then
            for v_return_item in
                select
                    e.key as item_code,
                    coalesce((e.value ->> 'quantity')::integer, 0) as quantity
                  from jsonb_each(v_items) e
                  join public.evd_item_catalog c on c.code = e.key
                 where coalesce((e.value ->> 'quantity')::integer, 0) > 0
                   and c.item_kind = '手動'
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

commit;

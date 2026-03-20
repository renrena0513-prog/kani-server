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
    v_regen_floor integer := 0;
begin
    select * into v_run from public.evd_game_runs where id = p_run_id and user_id = p_user_id for update;

    if p_status = '転送移動' or p_target_floor < v_run.current_floor then
        for v_regen_floor in p_target_floor..greatest(p_target_floor, v_run.current_floor - 1) loop
            v_floor_seed := public.evd_generate_floor(v_run.generation_profile_id, v_regen_floor, v_run.board_size);
            insert into public.evd_run_floors (
                run_id, user_id, account_name, floor_no, start_x, start_y, stairs_x, stairs_y, grid, revealed, visited, floor_status
            )
            values (
                p_run_id,
                p_user_id,
                v_run.account_name,
                v_regen_floor,
                (v_floor_seed ->> 'start_x')::integer,
                (v_floor_seed ->> 'start_y')::integer,
                (v_floor_seed ->> 'stairs_x')::integer,
                (v_floor_seed ->> 'stairs_y')::integer,
                v_floor_seed -> 'grid',
                v_floor_seed -> 'revealed',
                v_floor_seed -> 'visited',
                case when v_regen_floor = p_target_floor then p_status else '再生成' end
            )
            on conflict (run_id, floor_no) do update
               set account_name = excluded.account_name,
                   start_x = excluded.start_x,
                   start_y = excluded.start_y,
                   stairs_x = excluded.stairs_x,
                   stairs_y = excluded.stairs_y,
                   grid = excluded.grid,
                   revealed = excluded.revealed,
                   visited = excluded.visited,
                   floor_status = excluded.floor_status,
                   updated_at = now();
        end loop;
    elsif not exists (
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
                 then format('破滅の魔眼がこの階層の爆弾を暴いた。爆弾は %s 個あるようだ...', v_bomb_count)
                 else format('爆弾レーダーが反応を示した！この階層には爆弾が %s 個あるようだ...', v_bomb_count)
            end,
            jsonb_build_object('bomb_count', v_bomb_count, 'effect', case when v_has_doom_eye then 'relic_bomb_radar_always' else 'bomb_radar' end)
        );
    end if;
end;
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
    v_claimed_floor_bonuses jsonb := '[]'::jsonb;
    v_new_claimed_floors jsonb := '[]'::jsonb;
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

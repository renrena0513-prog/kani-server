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

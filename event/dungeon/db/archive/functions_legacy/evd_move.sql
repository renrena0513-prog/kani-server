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
    v_next_x integer;
    v_next_y integer;
    v_result jsonb;
begin
    if v_user_id = '' then
        raise exception 'ログインが必要です';
    end if;

    perform pg_advisory_xact_lock(hashtext('evd:' || v_user_id));

    select *
      into v_run
      from public.evd_game_runs
     where id = p_run_id
       and user_id = v_user_id
       and status = '進行中'
     for update;

    if not found then
        raise exception '進行中ランが見つかりません';
    end if;

    if coalesce(v_run.inventory_state -> 'pending_shop', 'null'::jsonb) <> 'null'::jsonb then
        raise exception 'ショップの処理を先に完了してください';
    end if;

    select *
      into v_floor
      from public.evd_run_floors
     where run_id = p_run_id
       and floor_no = v_run.current_floor
     for update;

    v_next_x := v_run.current_x + case p_direction when 'left' then -1 when 'right' then 1 else 0 end;
    v_next_y := v_run.current_y + case p_direction when 'up' then -1 when 'down' then 1 else 0 end;

    if v_next_x < 0 or v_next_x >= v_run.board_size or v_next_y < 0 or v_next_y >= v_run.board_size then
        raise exception '移動先が盤面の外です';
    end if;

    v_grid := v_floor.grid;
    v_cell := public.evd_get_cell(v_grid, v_next_x, v_next_y);

    v_cell := jsonb_set(
        jsonb_set(v_cell, array['revealed'], 'true'::jsonb, true),
        array['visited'],
        'true'::jsonb,
        true
    );
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
           revealed = case
               when not (v_floor.revealed @> jsonb_build_array(format('%s,%s', v_next_x, v_next_y)))
                   then v_floor.revealed || jsonb_build_array(format('%s,%s', v_next_x, v_next_y))
               else v_floor.revealed
           end,
           visited = case
               when not (v_floor.visited @> jsonb_build_array(format('%s,%s', v_next_x, v_next_y)))
                   then v_floor.visited || jsonb_build_array(format('%s,%s', v_next_x, v_next_y))
               else v_floor.visited
           end,
           updated_at = now()
     where id = v_floor.id;

    if coalesce((v_cell ->> 'resolved')::boolean, false) then
        return public.evd_build_snapshot(p_run_id, v_user_id);
    end if;

    v_result := public.evd_resolve_move_tile(p_run_id, v_cell ->> 'type');

    if coalesce((v_result ->> 'return_snapshot')::boolean, false) then
        return public.evd_build_snapshot(p_run_id, v_user_id);
    end if;

    v_cell := jsonb_set(v_cell, array['resolved'], 'true'::jsonb, true);
    v_grid := public.evd_set_cell(v_grid, v_next_x, v_next_y, v_cell);

    update public.evd_run_floors
       set grid = v_grid
     where id = v_floor.id;

    return public.evd_finalize_move(
        p_run_id,
        v_user_id,
        v_run.account_name,
        v_run.current_floor,
        v_cell ->> 'type',
        coalesce(v_result ->> 'message', ''),
        v_result ->> 'item_code',
        v_result ->> 'item_name'
    );
end;
$$;

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

    if p_action = 'return' or v_run.current_floor >= v_run.max_floors then
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

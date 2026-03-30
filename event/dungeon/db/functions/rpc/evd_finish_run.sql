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
    v_calc jsonb;
    v_inventory_state jsonb;
    v_items jsonb;
    v_carried_items jsonb;
    v_flags jsonb;
    v_payout integer := 0;
    v_has_coffin boolean := false;
begin
    select * into v_run from public.evd_game_runs where id = p_run_id and user_id = p_user_id for update;
    if not found then
        raise exception 'ランが見つかりません';
    end if;

    if p_status = '死亡' and public.evd_try_consume_revival_charm(p_run_id, p_user_id, v_run.account_name, v_run.current_floor) then
        return public.evd_build_snapshot(p_run_id, p_user_id);
    end if;

    v_calc := public.evd_finish_run_calculate(p_run_id, p_user_id, p_status);
    v_inventory_state := v_calc -> 'inventory_state';
    v_items := coalesce(v_calc -> 'items', '{}'::jsonb);
    v_carried_items := coalesce(v_calc -> 'carried_items', '{}'::jsonb);
    v_flags := coalesce(v_calc -> 'flags', '{}'::jsonb);
    v_payout := coalesce((v_calc ->> 'payout')::integer, 0);
    v_has_coffin := coalesce((v_calc ->> 'has_coffin')::boolean, false);

    v_carried_items := public.evd_finish_run_restore_items(
        p_user_id,
        v_run.account_name,
        p_status,
        v_items,
        v_carried_items,
        v_flags,
        v_has_coffin,
        v_run.substitute_negates_remaining
    );

    v_inventory_state := jsonb_set(v_inventory_state, array['carried_items'], v_carried_items, true);

    perform public.evd_finish_run_finalize(
        p_run_id,
        p_user_id,
        v_run.account_name,
        v_run.current_floor,
        p_status,
        p_reason,
        v_payout,
        v_inventory_state
    );

    return public.evd_build_snapshot(p_run_id, p_user_id);
end;
$$;

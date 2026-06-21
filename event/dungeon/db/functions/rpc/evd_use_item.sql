create or replace function public.evd_use_item(p_run_id uuid, p_item_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id text := public.evd_current_user_id();
    v_run public.evd_game_runs%rowtype;
    v_result jsonb;
    v_should_consume boolean := true;
    v_finish_run boolean := false;
    v_finish_status text;
    v_finish_reason text;
begin
    perform pg_advisory_xact_lock(hashtext('evd:' || v_user_id));

    select *
      into v_run
      from public.evd_game_runs
     where id = p_run_id
       and user_id = v_user_id
       and status = 'ラン中'
     for update;

    if not found then
        raise exception 'ラン中のランが見つかりません';
    end if;

    if coalesce((v_run.inventory_state -> 'items' -> p_item_code ->> 'quantity')::integer, 0) <= 0 then
        raise exception 'そのアイテムは所持していません';
    end if;

    v_result := public.evd_dispatch_use_item(
        p_run_id,
        v_user_id,
        v_run.account_name,
        v_run.current_floor,
        v_run.max_floors,
        v_run.generation_profile_id,
        p_item_code
    );

    v_should_consume := coalesce((v_result ->> 'should_consume')::boolean, true);
    v_finish_run := coalesce((v_result ->> 'finish_run')::boolean, false);
    v_finish_status := v_result ->> 'finish_status';
    v_finish_reason := v_result ->> 'finish_reason';

    if v_should_consume then
        update public.evd_game_runs
           set inventory_state = public.evd_remove_bucket_item(public.evd_remove_item(inventory_state, p_item_code, 1), 'carried_items', p_item_code, 1),
               updated_at = now(),
               last_active_at = now(),
               version = version + 1
         where id = p_run_id;
    end if;

    if v_finish_run then
        return public.evd_finish_run(p_run_id, v_user_id, v_finish_status, v_finish_reason);
    end if;

    return public.evd_build_snapshot(p_run_id, v_user_id);
end;
$$;
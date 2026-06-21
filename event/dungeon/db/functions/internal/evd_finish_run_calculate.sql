create or replace function public.evd_finish_run_calculate(
    p_run_id uuid,
    p_user_id text,
    p_status text
)
returns jsonb
language plpgsql
as $$
declare
    v_run public.evd_game_runs%rowtype;
    v_inventory_state jsonb;
    v_items jsonb;
    v_carried_items jsonb;
    v_flags jsonb;
    v_calc jsonb;
    v_payout integer := 0;
    v_has_coffin boolean := false;
begin
    select *
      into v_run
      from public.evd_game_runs
     where id = p_run_id
       and user_id = p_user_id
     for update;

    if not found then
        raise exception '対象のランが見つかりません';
    end if;

    if p_status = '帰還' then
        v_calc := public.evd_dispatch_finish_run_escape_settlement(
            v_run.inventory_state,
            v_run.run_coins,
            v_run.secured_coins,
            v_run.final_return_multiplier
        );
    else
        v_calc := public.evd_dispatch_finish_run_death_settlement(
            p_user_id,
            v_run.inventory_state,
            v_run.run_coins,
            v_run.secured_coins
        );
    end if;

    v_inventory_state := coalesce(v_calc -> 'inventory_state', v_run.inventory_state);
    v_payout := coalesce((v_calc ->> 'payout')::integer, 0);
    v_has_coffin := coalesce((v_calc ->> 'has_coffin')::boolean, false);
    v_items := coalesce(v_inventory_state -> 'items', '{}'::jsonb);
    v_carried_items := coalesce(v_inventory_state -> 'carried_items', '{}'::jsonb);
    v_flags := coalesce(v_inventory_state -> 'flags', '{}'::jsonb);

    return jsonb_build_object(
        'payout', greatest(v_payout, 0),
        'inventory_state', v_inventory_state,
        'items', v_items,
        'carried_items', v_carried_items,
        'flags', v_flags,
        'has_coffin', v_has_coffin,
        'selected_effect', v_calc -> 'selected_effect'
    );
end;
$$;
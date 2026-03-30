create or replace function public.evd_try_consume_revival_charm(
    p_run_id uuid,
    p_user_id text,
    p_account_name text,
    p_floor_no integer
)
returns boolean
language plpgsql
as $$
declare
    v_run public.evd_game_runs%rowtype;
    v_revive_hp integer := 1;
begin
    select *
      into v_run
      from public.evd_game_runs
     where id = p_run_id
       and user_id = p_user_id
     for update;

    if not found then
        return false;
    end if;

    if greatest(
        coalesce((v_run.inventory_state -> 'items' -> 'revival_charm' ->> 'quantity')::integer, 0),
        coalesce((v_run.inventory_state -> 'carried_items' -> 'revival_charm' ->> 'quantity')::integer, 0)
    ) <= 0 then
        return false;
    end if;

    select coalesce((effect_data ->> 'revive_hp')::integer, 1)
      into v_revive_hp
      from public.evd_item_catalog
     where code = 'revival_charm';

    update public.evd_game_runs
       set life = greatest(v_revive_hp, 1),
           inventory_state = public.evd_remove_bucket_item(
                public.evd_remove_item(inventory_state, 'revival_charm', 1),
                'carried_items',
                'revival_charm',
                1
           ),
           updated_at = now(),
           last_active_at = now(),
           version = version + 1
     where id = p_run_id;

    perform public.evd_add_log(
        p_run_id,
        p_user_id,
        p_account_name,
        p_floor_no,
        '自動発動',
        format('復活の護符が砕け、LIFE %s で復活した。', greatest(v_revive_hp, 1)),
        jsonb_build_object('effect', 'revive_on_death', 'item_code', 'revival_charm')
    );

    return true;
end;
$$;

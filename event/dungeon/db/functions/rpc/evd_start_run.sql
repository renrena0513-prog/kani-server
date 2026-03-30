create or replace function public.evd_start_run(p_carry_items text[] default '{}')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id text := public.evd_current_user_id();
    v_run_id uuid;
    v_context jsonb;
    v_profile_id uuid;
    v_account_name text;
    v_floor_seed jsonb;
    v_max_life integer := 3;
    v_inventory jsonb;
    v_initial_return_multiplier numeric(8, 2) := 1.0;
begin
    if v_user_id = '' then
        raise exception 'ログインが必要です';
    end if;

    perform pg_advisory_xact_lock(hashtext('evd:' || v_user_id));

    v_context := public.evd_start_run_load_context(v_user_id, p_carry_items);
    v_profile_id := (v_context ->> 'profile_id')::uuid;
    v_account_name := v_context ->> 'account_name';
    v_initial_return_multiplier := round((1.0 + coalesce((v_context ->> 'golden_return_bonus')::numeric, 0))::numeric, 2);

    if coalesce((v_context ->> 'has_giant_cup')::boolean, false) then
        v_max_life := v_max_life + 1;
    end if;

    v_inventory := public.evd_start_run_build_inventory(
        v_user_id,
        v_account_name,
        p_carry_items,
        coalesce(v_context -> 'passive_modifiers', '{}'::jsonb)
    );

    insert into public.evd_game_runs (
        user_id, account_name, generation_profile_id, status, life, max_life, inventory_state, substitute_negates_remaining, final_return_multiplier
    )
    values (
        v_user_id,
        v_account_name,
        v_profile_id,
        '騾ｲ陦御ｸｭ',
        v_max_life,
        v_max_life,
        v_inventory,
        case when coalesce((v_inventory -> 'flags' ->> 'substitute_ready')::boolean, false) then 3 else 0 end,
        v_initial_return_multiplier
    )
    returning id into v_run_id;

    v_floor_seed := public.evd_start_run_create_initial_floor(
        v_run_id,
        v_user_id,
        v_account_name,
        v_profile_id,
        7
    );

    perform public.evd_start_run_log(
        v_run_id,
        v_user_id,
        v_account_name,
        v_inventory,
        coalesce((v_context ->> 'golden_return_bonus')::numeric, 0),
        coalesce((v_context ->> 'has_doom_eye')::boolean, false),
        v_floor_seed,
        p_carry_items
    );

    return public.evd_build_snapshot(v_run_id, v_user_id);
end;
$$;

create or replace function public.evd_start_run_create_initial_floor(
    p_run_id uuid,
    p_user_id text,
    p_account_name text,
    p_profile_id uuid,
    p_board_size integer default 7
)
returns jsonb
language plpgsql
as $$
declare
    v_floor_seed jsonb;
begin
    v_floor_seed := public.evd_generate_floor(p_profile_id, 1, p_board_size);

    insert into public.evd_run_floors (
        run_id, user_id, account_name, floor_no, start_x, start_y, stairs_x, stairs_y, grid, revealed, visited, floor_status
    )
    values (
        p_run_id,
        p_user_id,
        p_account_name,
        1,
        (v_floor_seed ->> 'start_x')::integer,
        (v_floor_seed ->> 'start_y')::integer,
        (v_floor_seed ->> 'stairs_x')::integer,
        (v_floor_seed ->> 'stairs_y')::integer,
        v_floor_seed -> 'grid',
        v_floor_seed -> 'revealed',
        v_floor_seed -> 'visited',
        '騾ｲ陦御ｸｭ'
    );

    return v_floor_seed;
end;
$$;

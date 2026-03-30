create or replace function public.evd_set_cell(p_grid jsonb, p_x integer, p_y integer, p_cell jsonb)
returns jsonb
language sql
immutable
as $$
    select jsonb_set(p_grid, array[p_y::text, p_x::text], p_cell, true);
$$;

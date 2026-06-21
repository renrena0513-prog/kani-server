create or replace function public.evd_get_cell(p_grid jsonb, p_x integer, p_y integer)
returns jsonb
language sql
immutable
as $$
    select p_grid -> p_y -> p_x;
$$;

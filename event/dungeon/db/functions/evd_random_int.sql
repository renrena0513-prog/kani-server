create or replace function public.evd_random_int(p_min integer, p_max integer)
returns integer
language sql
as $$
    select floor(random() * ((p_max - p_min) + 1) + p_min)::integer;
$$;

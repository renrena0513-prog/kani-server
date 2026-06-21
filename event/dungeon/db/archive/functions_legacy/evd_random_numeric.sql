create or replace function public.evd_random_numeric(p_min numeric, p_max numeric)
returns numeric
language sql
as $$
    select round((random() * (p_max - p_min) + p_min)::numeric, 2);
$$;

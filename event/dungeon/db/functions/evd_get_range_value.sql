create or replace function public.evd_get_range_value(p_config jsonb, p_floor integer, p_key text, p_numeric boolean default false)
returns numeric
language plpgsql
as $$
declare
    v_floor_key text := p_floor::text;
    v_range jsonb;
begin
    v_range := p_config -> 'value_ranges' -> v_floor_key -> p_key;
    if v_range is null then
        return 0;
    end if;

    if p_numeric then
        return public.evd_random_numeric((v_range ->> 0)::numeric, (v_range ->> 1)::numeric);
    end if;

    return public.evd_random_int((v_range ->> 0)::integer, (v_range ->> 1)::integer);
end;
$$;

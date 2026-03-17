create or replace function public.evd_pick_weighted(p_weights jsonb)
returns text
language plpgsql
as $$
declare
    v_total integer := 0;
    v_roll numeric;
    v_acc integer := 0;
    v_key text;
    v_val integer;
begin
    for v_key, v_val in
        select key, value::integer
        from jsonb_each_text(p_weights)
    loop
        if v_val > 0 then
            v_total := v_total + v_val;
        end if;
    end loop;

    if v_total <= 0 then
        return '空白';
    end if;

    v_roll := floor(random() * v_total) + 1;

    for v_key, v_val in
        select key, value::integer
        from jsonb_each_text(p_weights)
    loop
        if v_val > 0 then
            v_acc := v_acc + v_val;
            if v_roll <= v_acc then
                return v_key;
            end if;
        end if;
    end loop;

    return '空白';
end;
$$;

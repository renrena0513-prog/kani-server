create or replace function public.evd_get_floor_value(
    p_profile_id uuid,
    p_floor integer,
    p_key text,
    p_numeric boolean default false
)
returns numeric
language plpgsql
as $$
declare
    v_row public.evd_floor_value_profiles%rowtype;
    v_min numeric := 0;
    v_max numeric := 0;
begin
    select *
      into v_row
      from public.evd_floor_value_profiles
     where profile_id = p_profile_id
       and floor_no = p_floor;

    if not found then
        return 0;
    end if;

    case p_key
        when '小銭' then
            v_min := coalesce(v_row.coin_small_min, 0);
            v_max := coalesce(v_row.coin_small_max, 0);
        when '宝箱' then
            v_min := coalesce(v_row.chest_min, 0);
            v_max := coalesce(v_row.chest_max, 0);
        when '財宝箱' then
            v_min := coalesce(v_row.treasure_chest_min, 0);
            v_max := coalesce(v_row.treasure_chest_max, 0);
        when '祝福' then
            v_min := coalesce(v_row.blessing_min, 0);
            v_max := coalesce(v_row.blessing_max, 0);
        when '呪い' then
            v_min := coalesce(v_row.curse_min, 0);
            v_max := coalesce(v_row.curse_max, 0);
        when '罠' then
            v_min := coalesce(v_row.trap_min, 0);
            v_max := coalesce(v_row.trap_max, 0);
        when '祈願符' then
            v_min := coalesce(v_row.jewel_gacha_rate_min, 0);
            v_max := coalesce(v_row.jewel_gacha_rate_max, 0);
        when '満願符' then
            v_min := coalesce(v_row.jewel_mangan_rate_min, 0);
            v_max := coalesce(v_row.jewel_mangan_rate_max, 0);
        else
            return 0;
    end case;

    if p_numeric then
        return round((random() * (v_max - v_min) + v_min)::numeric, 2);
    end if;

    return floor(random() * ((v_max::integer - v_min::integer) + 1) + v_min::integer)::integer;
end;
$$;

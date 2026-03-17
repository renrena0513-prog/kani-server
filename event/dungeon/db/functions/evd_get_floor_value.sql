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
            return public.evd_random_int(v_row.coin_small_min, v_row.coin_small_max);
        when '宝箱' then
            return public.evd_random_int(v_row.chest_min, v_row.chest_max);
        when '財宝箱' then
            return public.evd_random_int(v_row.treasure_chest_min, v_row.treasure_chest_max);
        when '祝福' then
            if p_numeric then
                return public.evd_random_numeric(v_row.blessing_min, v_row.blessing_max);
            end if;
            return public.evd_random_int(v_row.blessing_min::integer, v_row.blessing_max::integer);
        when '呪い' then
            if p_numeric then
                return public.evd_random_numeric(v_row.curse_min, v_row.curse_max);
            end if;
            return public.evd_random_int(v_row.curse_min::integer, v_row.curse_max::integer);
        when '罠' then
            return public.evd_random_int(v_row.trap_min, v_row.trap_max);
        when '盗賊' then
            return public.evd_random_int(v_row.thief_coin_loss_min, v_row.thief_coin_loss_max);
        when '祈願符' then
            if p_numeric then
                return public.evd_random_numeric(v_row.jewel_gacha_rate_min, v_row.jewel_gacha_rate_max);
            end if;
            return public.evd_random_int(v_row.jewel_gacha_rate_min::integer, v_row.jewel_gacha_rate_max::integer);
        when '満願符' then
            if p_numeric then
                return public.evd_random_numeric(v_row.jewel_mangan_rate_min, v_row.jewel_mangan_rate_max);
            end if;
            return public.evd_random_int(v_row.jewel_mangan_rate_min::integer, v_row.jewel_mangan_rate_max::integer);
        else
            return 0;
    end case;
end;
$$;

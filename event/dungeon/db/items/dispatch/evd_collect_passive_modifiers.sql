create or replace function public.evd_collect_passive_modifiers(
    p_user_id text
)
returns jsonb
language plpgsql
as $$
declare
    v_stock record;
    v_modifiers jsonb := jsonb_build_object(
        'carry_limit_bonus', 0,
        'return_multiplier_bonus', 0,
        'shop_discount_rate', 0,
        'always_bomb_radar', false,
        'max_life_bonus', 0,
        'death_coin_keep_bonus', 0,
        'keep_unused_manual_on_death', false
    );
begin
    for v_stock in
        select
            st.item_code,
            st.quantity,
            c.effect_data ->> 'effect' as effect_name
          from public.evd_player_item_stocks st
          join public.evd_item_catalog c
            on c.code = st.item_code
         where st.user_id = p_user_id
           and st.quantity > 0
           and c.is_active = true
    loop
        case v_stock.effect_name
            when 'relic_shop_discount_plus_5pct' then
                v_modifiers := public.evd_item_effect_relic_shop_discount_plus_5pct_collect(v_modifiers, v_stock.quantity);
            when 'relic_carry_limit_plus_1' then
                v_modifiers := public.evd_item_effect_relic_carry_limit_plus_1_collect(v_modifiers, v_stock.quantity);
            when 'relic_return_multiplier_plus_0_05' then
                v_modifiers := public.evd_item_effect_relic_return_multiplier_plus_0_05_collect(v_modifiers, v_stock.quantity);
            when 'relic_bomb_radar_always' then
                v_modifiers := public.evd_item_effect_relic_bomb_radar_always_collect(v_modifiers, v_stock.quantity);
            when 'relic_max_life_plus_1' then
                v_modifiers := public.evd_item_effect_relic_max_life_plus_1_collect(v_modifiers, v_stock.quantity);
            when 'relic_death_coin_keep_plus_2pct' then
                v_modifiers := public.evd_item_effect_relic_death_coin_keep_plus_2pct_collect(v_modifiers, v_stock.quantity);
            when 'relic_keep_unused_manual_on_death' then
                v_modifiers := public.evd_item_effect_relic_keep_unused_manual_on_death_collect(v_modifiers, v_stock.quantity);
        end case;
    end loop;

    return v_modifiers;
end;
$$;
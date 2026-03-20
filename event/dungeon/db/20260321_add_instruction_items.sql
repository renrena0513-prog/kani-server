insert into public.evd_item_catalog (
    code,
    name,
    description,
    item_kind,
    base_price,
    carry_in_allowed,
    shop_pool,
    sort_order,
    rarity,
    weight,
    is_active,
    effect_data
)
values
    (
        'merchant_whistle',
        '商人の笛',
        '使うとその階層の通常商人を呼べる',
        '手動',
        100,
        true,
        '通常',
        31,
        'R',
        1,
        true,
        jsonb_build_object('effect', 'merchant_whistle')
    ),
    (
        'special_merchant_whistle',
        '特別商人の笛',
        '使うとその階層の特別商人を呼べる',
        '手動',
        500,
        true,
        '限定',
        32,
        'SR',
        1,
        true,
        jsonb_build_object('effect', 'special_merchant_whistle')
    ),
    (
        'golden_bag',
        '成金の鞄',
        'それを持つと持っていけるアイテム枠が2増える',
        '手動',
        300,
        true,
        '通常',
        33,
        'SR',
        1,
        true,
        jsonb_build_object('effect', 'carry_limit_plus_2')
    )
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    item_kind = excluded.item_kind,
    base_price = excluded.base_price,
    carry_in_allowed = excluded.carry_in_allowed,
    shop_pool = excluded.shop_pool,
    sort_order = excluded.sort_order,
    rarity = excluded.rarity,
    weight = excluded.weight,
    is_active = excluded.is_active,
    effect_data = excluded.effect_data;

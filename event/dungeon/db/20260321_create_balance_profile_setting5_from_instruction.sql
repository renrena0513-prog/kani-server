delete from public.evd_floor_tile_weight_profiles
where profile_id in (
    select id
      from public.evd_game_balance_profiles
     where name = U&'\8A2D\5B9A\0035'
);

delete from public.evd_floor_value_profiles
where profile_id in (
    select id
      from public.evd_game_balance_profiles
     where name = U&'\8A2D\5B9A\0035'
);

delete from public.evd_floor_bonus_profiles
where profile_id in (
    select id
      from public.evd_game_balance_profiles
     where name = U&'\8A2D\5B9A\0035'
);

delete from public.evd_game_balance_profiles
where name = U&'\8A2D\5B9A\0035';

insert into public.evd_game_balance_profiles (
    name,
    description,
    config,
    is_active,
    created_at,
    updated_at
)
select
    U&'\8A2D\5B9A\0035',
    U&'\6B32\671B\30C0\30F3\30B8\30E7\30F3\6A19\6E96\8A2D\5B9A',
    src.config,
    false,
    now(),
    now()
from public.evd_game_balance_profiles src
where src.is_active = true
order by src.updated_at desc
limit 1;

insert into public.evd_floor_bonus_profiles (
    profile_id,
    floor_no,
    bonus_coins,
    shop_price_multiplier,
    created_at,
    updated_at
)
select
    dst.id,
    src.floor_no,
    coalesce(v.bonus_coins, src.bonus_coins),
    coalesce(v.shop_price_multiplier, src.shop_price_multiplier),
    now(),
    now()
from public.evd_floor_bonus_profiles src
join (
    select id
      from public.evd_game_balance_profiles
     where name = U&'\8A2D\5B9A\0035'
) dst
  on true
join (
    select id
      from public.evd_game_balance_profiles
     where is_active = true
     order by updated_at desc
     limit 1
) active_profile
  on src.profile_id = active_profile.id
left join (
    values
        (2, 50, 1.4::numeric),
        (3, 100, 1.6::numeric),
        (4, 150, 1.8::numeric),
        (5, 200, 2.0::numeric),
        (6, 500, 2.2::numeric),
        (7, 1000, 2.4::numeric),
        (8, 1500, 2.6::numeric),
        (9, 3000, 2.8::numeric),
        (10, 5000, 3.0::numeric)
) as v(
    floor_no,
    bonus_coins,
    shop_price_multiplier
)
  on src.floor_no = v.floor_no;

insert into public.evd_floor_value_profiles (
    profile_id,
    floor_no,
    coin_small_min,
    coin_small_max,
    chest_min,
    chest_max,
    treasure_chest_min,
    treasure_chest_max,
    blessing_min,
    blessing_max,
    curse_min,
    curse_max,
    trap_min,
    trap_max,
    thief_coin_loss_min,
    thief_coin_loss_max,
    jewel_gacha_rate_min,
    jewel_gacha_rate_max,
    jewel_mangan_rate_min,
    jewel_mangan_rate_max,
    created_at,
    updated_at
)
select
    dst.id,
    src.floor_no,
    v.coin_small_min,
    v.coin_small_max,
    v.chest_min,
    v.chest_max,
    v.treasure_chest_min,
    v.treasure_chest_max,
    v.blessing_min,
    v.blessing_max,
    v.curse_min,
    v.curse_max,
    v.trap_min,
    v.trap_max,
    coalesce(v.thief_coin_loss_min, src.thief_coin_loss_min),
    coalesce(v.thief_coin_loss_max, src.thief_coin_loss_max),
    src.jewel_gacha_rate_min,
    src.jewel_gacha_rate_max,
    src.jewel_mangan_rate_min,
    src.jewel_mangan_rate_max,
    now(),
    now()
from public.evd_floor_value_profiles src
join (
    select id
      from public.evd_game_balance_profiles
     where name = U&'\8A2D\5B9A\0035'
) dst
  on true
join (
    select id
      from public.evd_game_balance_profiles
     where is_active = true
     order by updated_at desc
     limit 1
) active_profile
  on src.profile_id = active_profile.id
join (
    values
        (1, 5, 50, 50, 120, 0, 0, 0.05::numeric, 0.14::numeric, 0.05::numeric, 0.11::numeric, 5, 40, null, null),
        (2, 10, 60, 70, 140, 0, 0, 0.06::numeric, 0.15::numeric, 0.06::numeric, 0.12::numeric, 10, 70, 200, 200),
        (3, 15, 70, 90, 160, 0, 0, 0.07::numeric, 0.16::numeric, 0.07::numeric, 0.13::numeric, 15, 100, 300, 300),
        (4, 20, 80, 110, 180, 0, 0, 0.08::numeric, 0.17::numeric, 0.08::numeric, 0.14::numeric, 20, 130, 400, 400),
        (5, 25, 90, 130, 200, 0, 0, 0.09::numeric, 0.18::numeric, 0.09::numeric, 0.15::numeric, 25, 160, 500, 500),
        (6, 30, 100, 150, 220, 250, 300, 0.10::numeric, 0.19::numeric, 0.10::numeric, 0.16::numeric, 30, 190, 600, 600),
        (7, 35, 110, 170, 240, 300, 400, 0.11::numeric, 0.20::numeric, 0.11::numeric, 0.17::numeric, 35, 220, 700, 700),
        (8, 40, 120, 190, 260, 350, 500, 0.12::numeric, 0.21::numeric, 0.12::numeric, 0.18::numeric, 40, 250, 800, 800),
        (9, 45, 130, 210, 280, 400, 600, 0.13::numeric, 0.22::numeric, 0.13::numeric, 0.19::numeric, 45, 280, 900, 900),
        (10, 50, 140, 230, 300, 450, 700, 0.14::numeric, 0.23::numeric, 0.14::numeric, 0.20::numeric, 50, 310, 1000, 1000)
) as v(
    floor_no,
    coin_small_min,
    coin_small_max,
    chest_min,
    chest_max,
    treasure_chest_min,
    treasure_chest_max,
    blessing_min,
    blessing_max,
    curse_min,
    curse_max,
    trap_min,
    trap_max,
    thief_coin_loss_min,
    thief_coin_loss_max
)
  on src.floor_no = v.floor_no;

insert into public.evd_floor_tile_weight_profiles (
    profile_id,
    floor_no,
    tile_type,
    weight,
    is_enabled,
    created_at,
    updated_at
)
select
    dst.id,
    src.floor_no,
    src.tile_type,
    coalesce(v.weight, src.weight),
    coalesce(v.weight, src.weight) > 0,
    now(),
    now()
from public.evd_floor_tile_weight_profiles src
join (
    select id
      from public.evd_game_balance_profiles
     where name = U&'\8A2D\5B9A\0035'
) dst
  on true
join (
    select id
      from public.evd_game_balance_profiles
     where is_active = true
     order by updated_at desc
     limit 1
) active_profile
  on src.profile_id = active_profile.id
left join (
    values
        (1, U&'\7A7A\767D', 300),
        (1, U&'\5C0F\92AD', 385),
        (1, U&'\5B9D\7BB1', 40),
        (1, U&'\8CA1\5B9D\7BB1', 0),
        (1, U&'\79D8\5B9D\7BB1', 0),
        (1, U&'\5B9D\77F3\7BB1', 0),
        (1, U&'\795D\798F', 50),
        (1, U&'\6CC9', 50),
        (1, U&'\7206\5F3E', 20),
        (1, U&'\5927\7206\767A', 0),
        (1, U&'\7F60', 105),
        (1, U&'\546A\3044', 10),
        (1, U&'\76D7\8CCA', 10),
        (1, U&'\843D\3068\3057\7A74', 10),
        (1, U&'\8EE2\9001\7F60', 0),
        (1, U&'\30B7\30E7\30C3\30D7', 0),
        (1, U&'\9650\5B9A\30B7\30E7\30C3\30D7', 0),
        (1, U&'\30A2\30A4\30C6\30E0', 20),
        (2, U&'\7A7A\767D', 275),
        (2, U&'\5C0F\92AD', 380),
        (2, U&'\5B9D\7BB1', 45),
        (2, U&'\8CA1\5B9D\7BB1', 0),
        (2, U&'\79D8\5B9D\7BB1', 0),
        (2, U&'\5B9D\77F3\7BB1', 0),
        (2, U&'\795D\798F', 55),
        (2, U&'\6CC9', 40),
        (2, U&'\7206\5F3E', 25),
        (2, U&'\5927\7206\767A', 0),
        (2, U&'\7F60', 100),
        (2, U&'\546A\3044', 20),
        (2, U&'\76D7\8CCA', 10),
        (2, U&'\843D\3068\3057\7A74', 10),
        (2, U&'\8EE2\9001\7F60', 0),
        (2, U&'\30B7\30E7\30C3\30D7', 20),
        (2, U&'\9650\5B9A\30B7\30E7\30C3\30D7', 0),
        (2, U&'\30A2\30A4\30C6\30E0', 20),
        (3, U&'\7A7A\767D', 250),
        (3, U&'\5C0F\92AD', 380),
        (3, U&'\5B9D\7BB1', 55),
        (3, U&'\8CA1\5B9D\7BB1', 0),
        (3, U&'\79D8\5B9D\7BB1', 0),
        (3, U&'\5B9D\77F3\7BB1', 0),
        (3, U&'\795D\798F', 60),
        (3, U&'\6CC9', 40),
        (3, U&'\7206\5F3E', 30),
        (3, U&'\5927\7206\767A', 0),
        (3, U&'\7F60', 95),
        (3, U&'\546A\3044', 30),
        (3, U&'\76D7\8CCA', 10),
        (3, U&'\843D\3068\3057\7A74', 10),
        (3, U&'\8EE2\9001\7F60', 0),
        (3, U&'\30B7\30E7\30C3\30D7', 20),
        (3, U&'\9650\5B9A\30B7\30E7\30C3\30D7', 0),
        (3, U&'\30A2\30A4\30C6\30E0', 20),
        (4, U&'\7A7A\767D', 225),
        (4, U&'\5C0F\92AD', 375),
        (4, U&'\5B9D\7BB1', 65),
        (4, U&'\8CA1\5B9D\7BB1', 0),
        (4, U&'\79D8\5B9D\7BB1', 0),
        (4, U&'\5B9D\77F3\7BB1', 20),
        (4, U&'\795D\798F', 65),
        (4, U&'\6CC9', 40),
        (4, U&'\7206\5F3E', 40),
        (4, U&'\5927\7206\767A', 0),
        (4, U&'\7F60', 70),
        (4, U&'\546A\3044', 40),
        (4, U&'\76D7\8CCA', 10),
        (4, U&'\843D\3068\3057\7A74', 10),
        (4, U&'\8EE2\9001\7F60', 0),
        (4, U&'\30B7\30E7\30C3\30D7', 20),
        (4, U&'\9650\5B9A\30B7\30E7\30C3\30D7', 0),
        (4, U&'\30A2\30A4\30C6\30E0', 20),
        (5, U&'\7A7A\767D', 200),
        (5, U&'\5C0F\92AD', 380),
        (5, U&'\5B9D\7BB1', 75),
        (5, U&'\8CA1\5B9D\7BB1', 0),
        (5, U&'\79D8\5B9D\7BB1', 0),
        (5, U&'\5B9D\77F3\7BB1', 20),
        (5, U&'\795D\798F', 70),
        (5, U&'\6CC9', 30),
        (5, U&'\7206\5F3E', 50),
        (5, U&'\5927\7206\767A', 0),
        (5, U&'\7F60', 65),
        (5, U&'\546A\3044', 50),
        (5, U&'\76D7\8CCA', 10),
        (5, U&'\843D\3068\3057\7A74', 10),
        (5, U&'\8EE2\9001\7F60', 0),
        (5, U&'\30B7\30E7\30C3\30D7', 20),
        (5, U&'\9650\5B9A\30B7\30E7\30C3\30D7', 0),
        (5, U&'\30A2\30A4\30C6\30E0', 20),
        (6, U&'\7A7A\767D', 170),
        (6, U&'\5C0F\92AD', 340),
        (6, U&'\5B9D\7BB1', 85),
        (6, U&'\8CA1\5B9D\7BB1', 10),
        (6, U&'\79D8\5B9D\7BB1', 0),
        (6, U&'\5B9D\77F3\7BB1', 20),
        (6, U&'\795D\798F', 75),
        (6, U&'\6CC9', 40),
        (6, U&'\7206\5F3E', 60),
        (6, U&'\5927\7206\767A', 10),
        (6, U&'\7F60', 60),
        (6, U&'\546A\3044', 60),
        (6, U&'\76D7\8CCA', 10),
        (6, U&'\843D\3068\3057\7A74', 10),
        (6, U&'\8EE2\9001\7F60', 5),
        (6, U&'\30B7\30E7\30C3\30D7', 15),
        (6, U&'\9650\5B9A\30B7\30E7\30C3\30D7', 10),
        (6, U&'\30A2\30A4\30C6\30E0', 20),
        (7, U&'\7A7A\767D', 140),
        (7, U&'\5C0F\92AD', 320),
        (7, U&'\5B9D\7BB1', 95),
        (7, U&'\8CA1\5B9D\7BB1', 20),
        (7, U&'\79D8\5B9D\7BB1', 0),
        (7, U&'\5B9D\77F3\7BB1', 20),
        (7, U&'\795D\798F', 80),
        (7, U&'\6CC9', 40),
        (7, U&'\7206\5F3E', 70),
        (7, U&'\5927\7206\767A', 20),
        (7, U&'\7F60', 55),
        (7, U&'\546A\3044', 70),
        (7, U&'\76D7\8CCA', 10),
        (7, U&'\843D\3068\3057\7A74', 10),
        (7, U&'\8EE2\9001\7F60', 5),
        (7, U&'\30B7\30E7\30C3\30D7', 15),
        (7, U&'\9650\5B9A\30B7\30E7\30C3\30D7', 10),
        (7, U&'\30A2\30A4\30C6\30E0', 20),
        (8, U&'\7A7A\767D', 125),
        (8, U&'\5C0F\92AD', 220),
        (8, U&'\5B9D\7BB1', 100),
        (8, U&'\8CA1\5B9D\7BB1', 40),
        (8, U&'\79D8\5B9D\7BB1', 0),
        (8, U&'\5B9D\77F3\7BB1', 20),
        (8, U&'\795D\798F', 100),
        (8, U&'\6CC9', 40),
        (8, U&'\7206\5F3E', 80),
        (8, U&'\5927\7206\767A', 30),
        (8, U&'\7F60', 60),
        (8, U&'\546A\3044', 80),
        (8, U&'\76D7\8CCA', 20),
        (8, U&'\843D\3068\3057\7A74', 10),
        (8, U&'\8EE2\9001\7F60', 10),
        (8, U&'\30B7\30E7\30C3\30D7', 20),
        (8, U&'\9650\5B9A\30B7\30E7\30C3\30D7', 25),
        (8, U&'\30A2\30A4\30C6\30E0', 20),
        (9, U&'\7A7A\767D', 100),
        (9, U&'\5C0F\92AD', 135),
        (9, U&'\5B9D\7BB1', 150),
        (9, U&'\8CA1\5B9D\7BB1', 60),
        (9, U&'\79D8\5B9D\7BB1', 0),
        (9, U&'\5B9D\77F3\7BB1', 20),
        (9, U&'\795D\798F', 120),
        (9, U&'\6CC9', 40),
        (9, U&'\7206\5F3E', 90),
        (9, U&'\5927\7206\767A', 40),
        (9, U&'\7F60', 55),
        (9, U&'\546A\3044', 90),
        (9, U&'\76D7\8CCA', 30),
        (9, U&'\843D\3068\3057\7A74', 10),
        (9, U&'\8EE2\9001\7F60', 10),
        (9, U&'\30B7\30E7\30C3\30D7', 10),
        (9, U&'\9650\5B9A\30B7\30E7\30C3\30D7', 20),
        (9, U&'\30A2\30A4\30C6\30E0', 20),
        (10, U&'\7A7A\767D', 0),
        (10, U&'\5C0F\92AD', 95),
        (10, U&'\5B9D\7BB1', 200),
        (10, U&'\8CA1\5B9D\7BB1', 100),
        (10, U&'\79D8\5B9D\7BB1', 0),
        (10, U&'\5B9D\77F3\7BB1', 20),
        (10, U&'\795D\798F', 150),
        (10, U&'\6CC9', 40),
        (10, U&'\7206\5F3E', 100),
        (10, U&'\5927\7206\767A', 50),
        (10, U&'\7F60', 50),
        (10, U&'\546A\3044', 95),
        (10, U&'\76D7\8CCA', 40),
        (10, U&'\843D\3068\3057\7A74', 0),
        (10, U&'\8EE2\9001\7F60', 20),
        (10, U&'\30B7\30E7\30C3\30D7', 10),
        (10, U&'\9650\5B9A\30B7\30E7\30C3\30D7', 10),
        (10, U&'\30A2\30A4\30C6\30E0', 20)
) as v(
    floor_no,
    tile_type,
    weight
)
  on src.floor_no = v.floor_no
 and src.tile_type = v.tile_type;

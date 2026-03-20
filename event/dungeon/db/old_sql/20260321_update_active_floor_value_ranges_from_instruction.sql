update public.evd_floor_value_profiles f
set coin_small_min = v.coin_small_min,
    coin_small_max = v.coin_small_max,
    chest_min = v.chest_min,
    chest_max = v.chest_max,
    treasure_chest_min = v.treasure_chest_min,
    treasure_chest_max = v.treasure_chest_max,
    blessing_min = v.blessing_min,
    blessing_max = v.blessing_max,
    curse_min = v.curse_min,
    curse_max = v.curse_max,
    trap_min = v.trap_min,
    trap_max = v.trap_max,
    updated_at = now()
from public.evd_game_balance_profiles p
join (
    values
        (1, 5, 40, 50, 100, 0, 0, 0.05::numeric, 0.12::numeric, 0.05::numeric, 0.12::numeric, 5, 50),
        (2, 10, 50, 70, 120, 0, 0, 0.06::numeric, 0.13::numeric, 0.06::numeric, 0.13::numeric, 10, 80),
        (3, 15, 60, 90, 140, 0, 0, 0.07::numeric, 0.14::numeric, 0.07::numeric, 0.14::numeric, 15, 110),
        (4, 20, 70, 110, 160, 0, 0, 0.08::numeric, 0.15::numeric, 0.08::numeric, 0.15::numeric, 20, 140),
        (5, 25, 80, 130, 180, 0, 0, 0.09::numeric, 0.16::numeric, 0.09::numeric, 0.16::numeric, 25, 170),
        (6, 30, 90, 150, 200, 200, 300, 0.10::numeric, 0.17::numeric, 0.10::numeric, 0.17::numeric, 30, 200),
        (7, 35, 100, 170, 220, 250, 400, 0.11::numeric, 0.18::numeric, 0.11::numeric, 0.18::numeric, 35, 230),
        (8, 40, 110, 190, 240, 300, 500, 0.12::numeric, 0.19::numeric, 0.12::numeric, 0.19::numeric, 40, 260),
        (9, 45, 120, 210, 260, 350, 600, 0.13::numeric, 0.20::numeric, 0.13::numeric, 0.20::numeric, 45, 290),
        (10, 50, 130, 230, 280, 400, 700, 0.14::numeric, 0.21::numeric, 0.14::numeric, 0.21::numeric, 50, 320)
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
    trap_max
)
  on p.is_active = true
where f.profile_id = p.id
  and f.floor_no = v.floor_no;

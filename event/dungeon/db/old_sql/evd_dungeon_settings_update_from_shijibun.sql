-- ダンジョン設定更新SQL（指示分 反映用）
-- 対象: public.evd_game_balance_profiles の name='default'
-- 反映内容:
--   1) evd_floor_tile_weight_profiles (階層ごとのタイル重み)
--   2) evd_floor_value_profiles (階層ごとの数値レンジ)

begin;

-- default プロファイルが存在しない場合はエラー
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM public.evd_game_balance_profiles
         WHERE name = 'default'
    ) THEN
        RAISE EXCEPTION 'evd_game_balance_profiles に name=default がありません';
    END IF;
END $$;

with target_profile as (
    select id as profile_id
      from public.evd_game_balance_profiles
     where name = 'default'
     limit 1
), tile_weights as (
    -- 指示分: マス重み
    select * from (values
        (1,'空白',300),(1,'小銭',350),(1,'宝箱',50),(1,'財宝箱',0),(1,'秘宝箱',0),(1,'宝石箱',10),(1,'祝福',100),(1,'泉',50),(1,'爆弾',50),(1,'大爆発',0),(1,'罠',50),(1,'呪い',0),(1,'盗賊',10),(1,'落とし穴',10),(1,'転送罠',0),(1,'ショップ',20),(1,'限定ショップ',0),
        (2,'空白',275),(2,'小銭',350),(2,'宝箱',60),(2,'財宝箱',0),(2,'秘宝箱',0),(2,'宝石箱',13),(2,'祝福',100),(2,'泉',47),(2,'爆弾',55),(2,'大爆発',0),(2,'罠',50),(2,'呪い',10),(2,'盗賊',10),(2,'落とし穴',10),(2,'転送罠',0),(2,'ショップ',20),(2,'限定ショップ',0),
        (3,'空白',250),(3,'小銭',350),(3,'宝箱',70),(3,'財宝箱',0),(3,'秘宝箱',0),(3,'宝石箱',16),(3,'祝福',100),(3,'泉',44),(3,'爆弾',60),(3,'大爆発',0),(3,'罠',50),(3,'呪い',20),(3,'盗賊',10),(3,'落とし穴',10),(3,'転送罠',0),(3,'ショップ',20),(3,'限定ショップ',0),
        (4,'空白',225),(4,'小銭',350),(4,'宝箱',80),(4,'財宝箱',0),(4,'秘宝箱',0),(4,'宝石箱',19),(4,'祝福',100),(4,'泉',41),(4,'爆弾',65),(4,'大爆発',0),(4,'罠',50),(4,'呪い',30),(4,'盗賊',10),(4,'落とし穴',10),(4,'転送罠',0),(4,'ショップ',20),(4,'限定ショップ',0),
        (5,'空白',200),(5,'小銭',350),(5,'宝箱',90),(5,'財宝箱',0),(5,'秘宝箱',0),(5,'宝石箱',22),(5,'祝福',100),(5,'泉',38),(5,'爆弾',70),(5,'大爆発',0),(5,'罠',50),(5,'呪い',40),(5,'盗賊',10),(5,'落とし穴',10),(5,'転送罠',0),(5,'ショップ',20),(5,'限定ショップ',0),
        (6,'空白',175),(6,'小銭',320),(6,'宝箱',100),(6,'財宝箱',10),(6,'秘宝箱',0),(6,'宝石箱',25),(6,'祝福',100),(6,'泉',35),(6,'爆弾',75),(6,'大爆発',10),(6,'罠',50),(6,'呪い',50),(6,'盗賊',10),(6,'落とし穴',10),(6,'転送罠',0),(6,'ショップ',20),(6,'限定ショップ',10),
        (7,'空白',150),(7,'小銭',300),(7,'宝箱',110),(7,'財宝箱',20),(7,'秘宝箱',0),(7,'宝石箱',28),(7,'祝福',100),(7,'泉',32),(7,'爆弾',80),(7,'大爆発',20),(7,'罠',50),(7,'呪い',60),(7,'盗賊',10),(7,'落とし穴',10),(7,'転送罠',0),(7,'ショップ',20),(7,'限定ショップ',10),
        (8,'空白',125),(8,'小銭',280),(8,'宝箱',120),(8,'財宝箱',30),(8,'秘宝箱',0),(8,'宝石箱',31),(8,'祝福',100),(8,'泉',29),(8,'爆弾',85),(8,'大爆発',30),(8,'罠',50),(8,'呪い',70),(8,'盗賊',10),(8,'落とし穴',10),(8,'転送罠',0),(8,'ショップ',20),(8,'限定ショップ',10),
        (9,'空白',100),(9,'小銭',260),(9,'宝箱',130),(9,'財宝箱',40),(9,'秘宝箱',0),(9,'宝石箱',34),(9,'祝福',100),(9,'泉',26),(9,'爆弾',90),(9,'大爆発',40),(9,'罠',50),(9,'呪い',80),(9,'盗賊',10),(9,'落とし穴',10),(9,'転送罠',0),(9,'ショップ',20),(9,'限定ショップ',10),
        (10,'空白',75),(10,'小銭',250),(10,'宝箱',140),(10,'財宝箱',50),(10,'秘宝箱',0),(10,'宝石箱',37),(10,'祝福',100),(10,'泉',23),(10,'爆弾',95),(10,'大爆発',50),(10,'罠',50),(10,'呪い',90),(10,'盗賊',10),(10,'落とし穴',0),(10,'転送罠',0),(10,'ショップ',20),(10,'限定ショップ',10)
    ) as t(floor_no, tile_type, weight)
)
insert into public.evd_floor_tile_weight_profiles (
    profile_id, floor_no, tile_type, is_enabled, weight, min_count, max_count
)
select
    p.profile_id,
    t.floor_no,
    t.tile_type,
    (t.weight > 0) as is_enabled,
    t.weight,
    0 as min_count,
    null::integer as max_count
from target_profile p
join tile_weights t on true
on conflict (profile_id, floor_no, tile_type) do update
set
    is_enabled = excluded.is_enabled,
    weight = excluded.weight,
    min_count = excluded.min_count,
    max_count = excluded.max_count,
    updated_at = now();

-- 指示分にないタイルが既存に残っている場合は、floor 1-10 だけ無効化
with target_profile as (
    select id as profile_id
      from public.evd_game_balance_profiles
     where name = 'default'
     limit 1
), provided_tiles as (
    select distinct tile_type
      from (values
        ('空白'),('小銭'),('宝箱'),('財宝箱'),('秘宝箱'),('宝石箱'),('祝福'),('泉'),('爆弾'),('大爆発'),('罠'),('呪い'),('盗賊'),('落とし穴'),('転送罠'),('ショップ'),('限定ショップ')
      ) t(tile_type)
)
update public.evd_floor_tile_weight_profiles w
   set is_enabled = false,
       weight = 0,
       min_count = 0,
       max_count = null,
       updated_at = now()
  from target_profile p
 where w.profile_id = p.profile_id
   and w.floor_no between 1 and 10
   and w.tile_type <> '下り階段'
   and not exists (
       select 1
         from provided_tiles pt
        where pt.tile_type = w.tile_type
   );

with target_profile as (
    select id as profile_id
      from public.evd_game_balance_profiles
     where name = 'default'
     limit 1
), value_ranges as (
    -- 指示分: 数値レンジ
    select * from (values
        (1, 5,30, 50,100, 0,0, 0.05::numeric,0.12::numeric, 0.05::numeric,0.12::numeric, 5,70),
        (2, 10,40, 70,120, 0,0, 0.06::numeric,0.13::numeric, 0.06::numeric,0.13::numeric, 10,100),
        (3, 15,50, 90,140, 0,0, 0.07::numeric,0.14::numeric, 0.07::numeric,0.14::numeric, 15,130),
        (4, 20,60, 110,160, 0,0, 0.08::numeric,0.15::numeric, 0.08::numeric,0.15::numeric, 20,160),
        (5, 25,70, 130,180, 0,0, 0.09::numeric,0.16::numeric, 0.09::numeric,0.16::numeric, 25,190),
        (6, 30,80, 150,200, 200,300, 0.10::numeric,0.17::numeric, 0.10::numeric,0.17::numeric, 30,220),
        (7, 35,90, 170,220, 250,400, 0.11::numeric,0.18::numeric, 0.11::numeric,0.18::numeric, 35,250),
        (8, 40,100, 190,240, 300,500, 0.12::numeric,0.19::numeric, 0.12::numeric,0.19::numeric, 40,280),
        (9, 45,110, 210,260, 350,600, 0.13::numeric,0.20::numeric, 0.13::numeric,0.20::numeric, 45,310),
        (10, 50,120, 230,280, 400,700, 0.14::numeric,0.21::numeric, 0.14::numeric,0.21::numeric, 50,340)
    ) as v(
        floor_no,
        coin_small_min, coin_small_max,
        chest_min, chest_max,
        treasure_chest_min, treasure_chest_max,
        blessing_min, blessing_max,
        curse_min, curse_max,
        trap_min, trap_max
    )
)
insert into public.evd_floor_value_profiles (
    profile_id, floor_no,
    coin_small_min, coin_small_max,
    chest_min, chest_max,
    treasure_chest_min, treasure_chest_max,
    blessing_min, blessing_max,
    curse_min, curse_max,
    trap_min, trap_max,
    thief_coin_loss_min, thief_coin_loss_max
)
select
    p.profile_id,
    v.floor_no,
    v.coin_small_min, v.coin_small_max,
    v.chest_min, v.chest_max,
    v.treasure_chest_min, v.treasure_chest_max,
    v.blessing_min, v.blessing_max,
    v.curse_min, v.curse_max,
    v.trap_min, v.trap_max,
    150 as thief_coin_loss_min,
    150 as thief_coin_loss_max
from target_profile p
join value_ranges v on true
on conflict (profile_id, floor_no) do update
set
    coin_small_min = excluded.coin_small_min,
    coin_small_max = excluded.coin_small_max,
    chest_min = excluded.chest_min,
    chest_max = excluded.chest_max,
    treasure_chest_min = excluded.treasure_chest_min,
    treasure_chest_max = excluded.treasure_chest_max,
    blessing_min = excluded.blessing_min,
    blessing_max = excluded.blessing_max,
    curse_min = excluded.curse_min,
    curse_max = excluded.curse_max,
    trap_min = excluded.trap_min,
    trap_max = excluded.trap_max,
    updated_at = now();

commit;

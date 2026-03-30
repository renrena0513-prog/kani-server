# Event Dungeon Compile Verification Guide

## 1. 目的

この手順は `20260330_event_dungeon_recreate_functions.sql` を本番前または staging で実行した際に、関数定義が compile できるか、依存解決順に問題がないかを確認するためのものです。

## 2. 実行前準備

- `drop` と `recreate` の両 SQL が最新 canonical source から生成済みであること
- `STRUCTURE.md` の build order が script と一致していること
- 依存テーブルと catalog が存在すること
- `public` schema へ function 作成権限があること

## 3. 依存オブジェクト存在確認 SQL

```sql
select n.nspname as schema_name, c.relname as object_name, c.relkind
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'profiles',
    'evd_game_runs',
    'evd_run_floors',
    'evd_run_events',
    'evd_player_item_stocks',
    'evd_item_catalog',
    'evd_game_balance_profiles',
    'evd_floor_bonus_profiles',
    'evd_floor_tile_weight_profiles',
    'evd_floor_value_profiles'
  )
order by c.relname;
```

不足が 1 つでもあれば `NO-GO` です。

## 4. compile 確認手順

1. `20260330_event_dungeon_drop_legacy_functions.sql` を適用する
2. `20260330_event_dungeon_recreate_functions.sql` を適用する
3. SQL Editor / psql で error が 0 件であることを確認する
4. 直後に `pg_proc` 検証 SQL を実行する
5. helper と RPC の件数が期待値と一致することを確認する

## 5. pg_proc 検証 SQL

### 関数一覧、引数、戻り値

```sql
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  pg_get_function_result(p.oid) as returns,
  l.lanname as language_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where n.nspname = 'public'
  and p.proname like 'evd_%'
order by p.proname, args;
```

### 期待関数数

```sql
select count(*) as evd_function_count
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname like 'evd_%';
```

期待値:
- public RPC: 9
- internal helper: 26
- retired helper: 0

### retired helper と削除済み RPC が残っていないこと

```sql
select proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('evd_get_range_value', 'evd_random_int', 'evd_random_numeric', 'evd_resolve_thief');
```

0 行であること。

### principal RPC の戻り値確認

```sql
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  pg_get_function_result(p.oid) as returns
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'evd_start_run',
    'evd_move',
    'evd_use_item',
    'evd_resolve_stairs',
    'evd_claim_altar_reward',
    'evd_shop_purchase',
    'evd_buy_stock_item',
    'evd_set_stock_item_set',
    'evd_finish_run'
  )
order by p.proname;
```

## 6. 作成順序確認

- build order の正本は [`STRUCTURE.md`](C:/Arakawa/かに鯖サイト/event/dungeon/db/functions/STRUCTURE.md)
- recreate bundle 生成元は [`build_event_dungeon_bundle.ps1`](C:/Arakawa/かに鯖サイト/event/dungeon/db/scripts/build_event_dungeon_bundle.ps1)
- 両者が一致しない場合は `NO-GO`

## 7. compile 確認後の判定

- SQL 実行 error 0 件
- `pg_proc` 検証で関数一覧、引数、戻り値が一致
- retired helper / 削除済み RPC 0 件
- 依存テーブル不足 0 件

上記を全て満たした場合のみ smoke test へ進む

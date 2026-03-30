# Event Dungeon Old SQL Final Disposition

## Archive に残す旧 SQL

- `event/dungeon/db/archive/evd_latest_bundle_update.sql`
- `event/dungeon/db/archive/evd_add_new_items_and_normal_limited_shop.sql`
- `event/dungeon/db/archive/functions_legacy/all_functions.sql`
- `event/dungeon/db/archive/functions_legacy/evd_*.sql`

## Active Path から除外済み

- `event/dungeon/db/functions/all_functions.sql`
- `event/dungeon/db/functions/evd_*.sql`

## 削除してよい旧 SQL

- active path 上では該当なし
- 物理削除する場合も archive 側を比較・rollback 用に残してから行う

## 保留

- archive 配下は rollback / 比較用のため保持
- 旧 SQL を正本へ戻す運用は禁止
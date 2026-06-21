# Dungeon DB Workflow

## Canonical Source

- `db/functions/internal/`
  共通 helper の正本
- `db/functions/rpc/`
  アプリが直接呼ぶ RPC の正本
- `db/items/`
  item 定義、effect handler、dispatcher の正本
- `db/migrations/`
  本番適用用 SQL
- `db/scripts/`
  bundle 生成 / 検証補助
- `db/archive/`
  rollback / 比較用の旧 SQL 保管先

## Active Path Rule

- active path に旧 bundle / patch / `all_functions.sql` / 旧直置き `evd_*.sql` は残しません
- `db/functions/` 直下は `README.md` と `STRUCTURE.md` だけを残します
- 関数正本は `db/functions/internal/` と `db/functions/rpc/` と `db/items/` だけです

## How To Apply

1. `db/scripts/build_event_dungeon_bundle.ps1` を実行する
2. `db/migrations/20260330_event_dungeon_drop_legacy_functions.sql` を適用する
3. `db/migrations/20260330_event_dungeon_recreate_functions.sql` を適用する
4. `db/migrations/20260330_event_dungeon_normalize_item_effects.sql` を適用する
5. `db/migrations/20260330_event_dungeon_remove_deleted_tiles.sql` を適用する
6. `db/scripts/post_deploy_verify.sql` を実行する
7. smoke test を実施する

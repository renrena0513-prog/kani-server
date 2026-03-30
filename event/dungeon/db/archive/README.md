# Event Dungeon DB Archive Policy

このディレクトリは rollback / 比較用の旧 source を保管する場所です。

## Archive 扱いにするもの

- `evd_latest_bundle_update.sql`
- `evd_add_new_items_and_normal_limited_shop.sql`
- `functions_legacy/all_functions.sql`
- `functions_legacy/evd_*.sql` の旧直置き版

## Rule

- archive 配下の SQL は参照専用です
- 本番更新の正本として使いません
- rollback 時に旧 bundle 比較が必要な場合だけ参照します
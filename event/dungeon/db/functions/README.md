# Dungeon DB Functions

## Canonical Source

- `internal/`: helper の正本
- `rpc/`: 公開 RPC の正本

## Legacy Handling

- `../archive/functions_legacy/all_functions.sql`: 旧 bundle。参照専用
- `../archive/functions_legacy/evd_*.sql`: 旧直置き版。参照専用
- `../migrations/20260330_event_dungeon_recreate_functions.sql`: 正本から生成した適用 bundle

## Rule

- 関数追加 / 修正は必ず `internal/` または `rpc/` を更新する
- item effect 追加は `../items/` を先に更新する
- 変更後は `build_event_dungeon_bundle.ps1` で bundle を再生成する
- archive 配下の旧 SQL は編集禁止
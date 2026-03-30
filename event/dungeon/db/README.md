# Dungeon DB Workflow

<<<<<<< HEAD
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
=======
## Directory Rules

- `db/`
  これから実行する更新用 SQL を置く

- `db/old_sql/`
  実行済みの SQL を保管する

- `db/functions/`
  関数ごとの最新定義を置く

## Current Files

- `evd_dungeon_setup.sql`
  現在の最新状態をまとめた再構築用 SQL

- `functions/all_functions.sql`
  関数をまとめて再適用するときの一括用 SQL

- `functions/evd_*.sql`
  個別関数ごとの最新定義

## Policy

- 新しい修正 SQL はまず `db/` 直下に作る
- 実行が終わった SQL は `db/old_sql/` へ移す
- 内容が確定したら `evd_dungeon_setup.sql` や `functions/` に取り込む

## How To Apply

### 1. 更新 SQL を作る場所

- 単発の修正は `db/` 直下に `YYYYMMDD_*.sql` 形式で作る
- 関数本体の最新形は `db/functions/` の対象ファイルも更新する

### 2. 実行方法

- Supabase SQL Editor を使う場合:
  `db/` の更新用 SQL を開いてそのまま実行する

- `psql` を使う場合:
  `psql "<connection string>" -f event/dungeon/db/20260319_fix_revival_charm_finish_run.sql`

- 関数単体を直接反映したい場合:
  `db/functions/` の対象ファイルの中身をそのまま実行する

### 3. 今回の復活の護符修正

- 更新用 SQL:
  `db/20260319_fix_revival_charm_finish_run.sql`

- 実体の関数定義:
  `db/functions/evd_finish_run.sql`
>>>>>>> f4551e61db7ebd161209630406706d93ed61315c

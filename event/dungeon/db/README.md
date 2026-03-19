# Dungeon DB Workflow

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

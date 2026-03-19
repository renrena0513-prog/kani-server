# Dungeon DB Workflow

## Directory Rules

- `db/`
  これから実行するSQLを置く

- `db/old_sql/`
  実行済みのSQLを保管する

## Current Files

- `evd_dungeon_setup.sql`
  現在の最新状態をまとめた再構築用SQL

## Policy

- 新しい修正SQLはまず `db/` 直下に作る
- 実行が終わったSQLは `db/old_sql/` へ移す
- 内容が確定したら `evd_dungeon_setup.sql` に取り込む

# Event Dungeon DB Deploy Final Runbook

## SQL Files To Execute

1. `event/dungeon/db/migrations/20260330_event_dungeon_drop_legacy_functions.sql`
2. `event/dungeon/db/migrations/20260330_event_dungeon_recreate_functions.sql`
3. `event/dungeon/db/migrations/20260330_event_dungeon_normalize_item_effects.sql`
4. `event/dungeon/db/migrations/20260330_event_dungeon_remove_deleted_tiles.sql`
5. `event/dungeon/db/scripts/post_deploy_verify.sql`

## Pre-Check SQL

```sql
select id, user_id, started_at
from public.evd_game_runs
where status = '進行中'
order by started_at desc;
```

```sql
select schemaname, tablename, policyname, qual, with_check
from pg_policies
where schemaname = 'public'
  and (qual ilike '%evd_current_user_id%' or with_check ilike '%evd_current_user_id%')
order by tablename, policyname;
```

```sql
select proname
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname like 'evd_%'
order by proname;
```

## Execution Order

1. Event dungeon の新規操作を停止する
2. active run が 0 件であることを確認する
3. DB dump / schema dump を取得する
4. `drop_legacy_functions.sql` を実行する
5. `recreate_functions.sql` を実行する
6. `normalize_item_effects.sql` を実行する
7. `remove_deleted_tiles.sql` を実行する
8. `post_deploy_verify.sql` を実行する
9. smoke test を実行する
10. Event dungeon を再開する

## Important Note

- `evd_current_user_id()` は RLS policy 依存があるため drop 対象に含めません
- この関数は `recreate_functions.sql` の `create or replace function` で上書きします
- policy を落とさない限り `drop function evd_current_user_id()` は実行しません

## Post-Deploy Verify Order

1. `pg_proc` の `evd_%` 一覧確認
2. retired helper 0 件確認
3. item effect 正規化結果確認
4. 削除済み tile / item 残骸 0 件確認
5. `evd_validate_item_effect_registry()` が 0 行確認

## Smoke Test Order

1. ラン開始
2. 1 マス移動
3. アイテム取得
4. アイテム使用
5. ショップ購入
6. 階段遷移
7. 報酬受取
8. ラン終了
9. 異常系
10. rollback 手順の staging 確認

## Rollback

- deploy 直前 dump を復元する
- 旧 `evd_%` 関数定義を戻す
- `pg_proc` 一覧と snapshot 読み取りを確認する
- 部分的に recreate が失敗した場合は dump ベースで戻す
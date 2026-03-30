# Event Dungeon Production Apply Guide

## 1. 適用前の確認事項

- 作業対象 DB がイベントダンジョンの利用時間外か、少なくとも新規 run を止められる状態であること
- `evd_game_runs` に `status = '進行中'` の run が残っていないこと
- 直近バックアップまたは schema dump を取得済みであること
- [`20260330_event_dungeon_drop_legacy_functions.sql`](C:/Arakawa/かに鯖サイト/event/dungeon/db/migrations/20260330_event_dungeon_drop_legacy_functions.sql) と [`20260330_event_dungeon_recreate_functions.sql`](C:/Arakawa/かに鯖サイト/event/dungeon/db/migrations/20260330_event_dungeon_recreate_functions.sql) が最新の正本から生成されていること
- `functions/internal`、`functions/rpc`、`items` 以外に未反映の source がないこと
- `evd_current_user_id()` を参照する RLS policy が存在するため、この関数は drop せず `create or replace` で上書きすること

## 2. 本番適用前に確認すべき SQL

- active run 確認
```sql
select id, user_id, started_at
from public.evd_game_runs
where status = '進行中'
order by started_at desc;
```

- `evd_current_user_id()` 依存 policy 確認
```sql
select schemaname, tablename, policyname, qual, with_check
from pg_policies
where schemaname = 'public'
  and (qual ilike '%evd_current_user_id%' or with_check ilike '%evd_current_user_id%')
order by tablename, policyname;
```

- 公開 RPC の存在確認
```sql
select proname
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname like 'evd_%'
order by proname;
```

## 3. 確認観点

- drop 前に `進行中` run がない
- `evd_current_user_id()` は drop 対象に含めない
- recreate bundle に retired helper が含まれていない
- recreate bundle の build order が `STRUCTURE.md` と一致している
- recreate 後に公開 RPC 名が変わっていない

## 4. 安全な適用順序

1. event dungeon の新規操作を止める
2. active run がないことを確認する
3. 現行関数一覧を保存する
4. 必要なら pre-deploy dump を取得する
5. drop SQL を適用する
6. recreate SQL を適用する
7. normalize / cleanup SQL を適用する
8. 関数一覧を再確認する
9. smoke test を実施する
10. event dungeon を再開する
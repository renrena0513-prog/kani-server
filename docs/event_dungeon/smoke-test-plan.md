# Event Dungeon Smoke Test Plan

## 前提

- compile 確認済み
- 検証用ユーザーを 1 つ以上用意する
- `profiles.coins` を十分額に調整できること
- `evd_item_catalog` / `evd_player_item_stocks` を検証用に更新できること
- `20260330_event_dungeon_remove_deleted_tiles.sql` を適用済みであること

## 1. ラン開始

```sql
update public.profiles
set coins = 5000
where discord_user_id = :test_user_id;

select public.evd_start_run('{}'::text[]);
```

確認:
- `evd_game_runs` に 1 行追加
- `status = '進行中'`
- `evd_run_floors` に floor 1 が追加
- `evd_run_events` に開始ログが追加

## 2. 1 マス移動

```sql
select id, current_x, current_y from public.evd_game_runs where user_id = :test_user_id and status = '進行中';
select public.evd_move(:run_id, 'up');
```

確認:
- `current_x/current_y` が変化
- `evd_run_floors.grid` の対象マスが `revealed/visited/resolved` へ更新
- `evd_run_events` に移動ログが増える

## 3. アイテム取得

手順:
- floor の隣接マスを `アイテム` tile に調整する
- `select public.evd_move(:run_id, 'right');`

確認:
- snapshot に item 情報が返る
- `inventory_state.items` または `carried_items` が更新される
- item 種別に応じて `substitute_negates_remaining` や flag が更新される

## 4. ショップ購入

手順:
- 隣接マスを `ショップ` tile に調整して移動
- pending_shop を確認
- `select public.evd_shop_purchase(:run_id, :item_code);`

確認:
- `pending_shop` が解消される
- `run_coins` または inventory が更新される
- skip は `select public.evd_shop_purchase(:run_id, null);`

## 5. 階段遷移

手順:
- 現在マスを `下り階段` に調整
- `select public.evd_resolve_stairs(:run_id, 'descend');`

確認:
- `current_floor` が更新
- `evd_run_floors` に次階層が作成される
- 到達ボーナスログが追加される

## 6. 報酬受取

手順:
- 最終階層で祭壇 pending を作る
- `select public.evd_claim_altar_reward(:run_id, :reward_code);`

確認:
- 許可 item だけ受理される
- 報酬ログが追加される
- `evd_finish_run` が走り結果画面用 snapshot が返る

## 7. ラン終了

```sql
select public.evd_finish_run(:run_id, :test_user_id, '帰還', 'manual test');
```

確認:
- `status = '帰還'` または `死亡`
- `result_payout >= 0`
- `profiles.coins` / `total_assets` が更新
- stock 返却が `evd_player_item_stocks` に反映

## 8. 異常系

- coin 不足で `evd_start_run` が失敗
- `進行中` run ありで `evd_start_run` が失敗
- pending_shop 中に `evd_move` が失敗
- 不正 item code で `evd_claim_altar_reward` が失敗
- 盤面外移動で `evd_move` が失敗

## 9. 削除仕様の残骸確認

```sql
select count(*) as legacy_tile_weight_rows
from public.evd_floor_tile_weight_profiles
where tile_type in ('盗賊', '落とし穴', '転送罠');

select count(*) as legacy_item_rows
from public.evd_item_catalog
where code in ('thief_ward_charm', 'escape_talisman');

select count(*) as legacy_stock_rows
from public.evd_player_item_stocks
where item_code in ('thief_ward_charm', 'escape_talisman');
```

確認:
- すべて 0 件
- `evd_run_floors.grid::text` を検索しても削除済み tile が残らない

## 10. ロールバック確認

- compile 失敗を模擬した staging で rollback guide を実行確認する
- deploy 前 dump から関数定義のみ戻せることを確認する
- rollback 後に `pg_proc` の `evd_%` 一覧が旧状態へ戻ることを確認する

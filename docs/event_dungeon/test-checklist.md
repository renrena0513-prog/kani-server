# Event Dungeon Test Checklist

## ラン開始

- 持込 0 件で `evd_start_run` が成功する
- 持込上限超過で失敗する
- 1000 coin 未満で失敗する
- 進行中 run がある状態で失敗する
- relic による carry limit / max life / return bonus が反映される

## 移動

- 盤面外移動が失敗する
- 未解決マスで `evd_move` が state を更新する
- 既解決マス再訪で snapshot のみ返る
- coin / trap / blessing / curse / item / shop / stairs の各 tile が壊れない
- floor 生成結果に `盗賊` / `落とし穴` / `転送罠` が含まれない

## 戦闘やイベント進行

- substitute による被害無効化が減算される
- revival charm で死亡直後に復帰する
- bomb radar / relic ログが開始時に正しく記録される
- 削除済み tile に由来する `pending_thief` が生成されない

## ショップ購入

- `evd_shop_purchase` で item 購入と skip が両方成功する
- pending_shop 中に別移動が拒否される
- coin 不足時に失敗する

## 階段遷移

- 通常階段で次 floor へ進める
- 最終階層で祭壇報酬待ちに入る
- abyss ticket / stairs 処理で `evd_resolve_floor_shift` が壊れない

## 報酬受取

- `evd_claim_altar_reward` が許可 item で成功する
- 不正 item code で失敗する
- 報酬受取後に finish_run へ遷移する

## ラン終了

- escape 時 payout が計算される
- death 時 insurance / vault_box / coffin 系が反映される
- return 対象 item が stock に戻る
- `profiles.coins` と `total_assets` が更新される

## エラー時のロールバック

- start_run 中の失敗で coin と stock が半端に減らない
- move 中の失敗で floor / run が不整合にならない
- finish_run 中の失敗で stock と payout が二重反映されない

## データ不整合

- `evd_run_floors.grid` と `revealed` / `visited` が矛盾しない
- `substitute_negates_remaining` が負値にならない
- `result_payout` が負値にならない
- `evd_run_events.step_no` が単調増加する
- `evd_item_catalog` / `evd_player_item_stocks` に `thief_ward_charm` / `escape_talisman` が残らない

# Event Dungeon Table Drop Candidates

## Conclusion

現時点で安全に drop 候補へ進められる event dungeon table はありません。

## Reviewed Tables

- `evd_game_runs`
  - 現行 RPC / helper から更新・参照されるため保持
- `evd_run_floors`
  - floor 生成・移動・階層遷移で使用するため保持
- `evd_run_events`
  - ログ / snapshot 表示で使用するため保持
- `evd_item_catalog`
  - item dispatcher / catalog 取得 / validation で使用するため保持
- `evd_player_item_stocks`
  - stock / passive modifier /返却処理で使用するため保持
- `evd_floor_tile_weight_profiles`
  - floor 生成で使用するため保持
- `evd_floor_value_profiles`
  - floor 数値レンジで使用するため保持
- `evd_floor_bonus_profiles`
  - 階段進行 / snapshot / abyss ticket で使用するため保持
- `evd_game_balance_profiles`
  - ラン開始条件で使用するため保持

## Hold Reason

- コード参照と migration 参照の両方で live dependency が残っています
- 旧仕様の残骸は table drop ではなく data cleanup で解消できます
- table drop が必要になった場合は、usage / foreign key / app query を再確認した上で別 migration に分離してください
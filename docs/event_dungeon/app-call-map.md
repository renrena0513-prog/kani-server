# Event Dungeon App Call Map

## RPC Callers

| App File | Function | RPC / Query | Notes |
| --- | --- | --- | --- |
| `event/dungeon/js/game.js` | `toggleCarry` | `evd_set_stock_item_set` | RPC 名維持 |
| `event/dungeon/js/game.js` | `startRun` | `evd_start_run` | RPC 名維持 |
| `event/dungeon/js/game.js` | `moveTo` | `evd_move` | 盗賊待機分岐を削除 |
| `event/dungeon/js/game.js` | `useItem` | `evd_use_item` | RPC 名維持 |
| `event/dungeon/js/game.js` | `resolveStairs` | `evd_resolve_stairs` | RPC 名維持 |
| `event/dungeon/js/game.js` | `claimAltarReward` | `evd_claim_altar_reward` | RPC 名維持 |
| `event/dungeon/js/game.js` | `buyItem` / `skipShop` | `evd_shop_purchase` | RPC 名維持 |
| `event/dungeon/js/game.js` | `buyStock` | `evd_buy_stock_item` | RPC 名維持 |

## Direct Table Reads

| App File | Function | Query Target |
| --- | --- | --- |
| `event/dungeon/js/api.js` | `getProfile` | `profiles` |
| `event/dungeon/js/api.js` | `getStocks` | `evd_player_item_stocks`, `evd_item_catalog` |
| `event/dungeon/js/api.js` | `getActiveRun` | `evd_game_runs` |
| `event/dungeon/js/api.js` | `getCurrentFloor` | `evd_run_floors` |
| `event/dungeon/js/api.js` | `getLogs` | `evd_run_events` |
| `event/dungeon/js/api.js` | `getCatalog` | `evd_item_catalog` |

## Conclusion

- アプリ側から盗賊 RPC を呼ぶ経路は削除済みです
- RPC contract は `evd_resolve_thief` を除いて維持しています
- `api.js` の直接参照先は変更していません

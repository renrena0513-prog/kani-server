# Event Page Access

イベントページだけ、`page_settings` で `is_active = false` の間も、指定したユーザーだけアクセスできるようにするための設定です。

## 使い方

- 対象ページを増やす: `config.js` の `restrictedEventAccess` に設定を追加
- ユーザーを増やす: 対象ページの `allowedUserIds` に Discord ID を追加
- 対象ページを外す: `restrictedEventAccess` から削除

## 例

```js
restrictedEventAccess: [
    {
        path: '/event/dungeon',
        allowedUserIds: ['1310545500604005430']
    },
    {
        path: '/event/summer-fes',
        allowedUserIds: ['111111111111111111', '222222222222222222']
    }
]
```

`/index.html` 付きでも、末尾スラッシュ付きでも、`auth-guard.js` 側で正規化して扱います。

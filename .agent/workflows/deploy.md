---
description: サイトをデプロイする方法
---

# デプロイ手順

このプロジェクトはGitHubとVercelが連携しており、`main`ブランチにプッシュすると自動でデプロイされます。

## 手順

// turbo-all

1. 変更をステージングに追加
```
git add -A
```

2. コミットを作成
```
git commit -m "変更内容の説明"
```

3. GitHubにプッシュ（これでVercelが自動デプロイ開始）
```
git push origin main
```

## 確認

デプロイの進行状況は以下で確認できます：
- Vercelダッシュボード: https://vercel.com/renrena0513-progs-projects/kani-server

## 注意

- PowerShellでは `&&` が使えないため、コマンドは分けて実行する必要があります
- Vercel CLIは不要です（GitHub連携で自動デプロイ）

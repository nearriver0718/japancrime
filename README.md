# 日本犯罪データベース

日本の犯罪事件・未解決事件のデータベースと考察掲示板。

## 機能

- 209件の犯罪事件データベース（詳細説明文・タグ・年代情報付き）
- タグ・年代フィルター、キーワード検索
- 事件ごとの考察・議論掲示板
- Google AdSense広告枠
- Amazon アフィリエイト書籍リスト
- SEO対応（OGP, sitemap.xml, robots.txt, 構造化データ）

## 技術スタック

- **Backend**: Node.js + Express
- **Database**: SQLite (better-sqlite3)
- **Frontend**: Vanilla JavaScript (SPA)
- **Rate Limiting**: express-rate-limit

## ローカル開発

```bash
npm install
node server.js
# http://localhost:3000
```

## 環境変数

| 変数名 | デフォルト | 説明 |
|---|---|---|
| `PORT` | `3000` | サーバーポート |
| `DB_PATH` | `./forum.db` | SQLiteファイルパス |
| `SITE_URL` | `https://japancrime.com` | サイトのベースURL |

## デプロイ

### Render.com

1. GitHubリポジトリをRender.comに接続
2. `render.yaml` が自動検出される
3. Persistent Disk `/data` を1GB割り当て
4. カスタムドメインを設定

### Docker

```bash
docker build -t japancrime .
docker run -p 3000:3000 -v $(pwd)/data:/data japancrime
```

## カスタマイズ（収益化）

### Google AdSense

`public/index.html` と `public/js/app.js` 内の以下をあなたのIDに置換：
- `ca-pub-XXXXXXXXXXXXXXXX` → あなたの Publisher ID
- `data-ad-slot="XXXXXXXXXX"` → 各広告ユニットのSlot ID
- コメントアウトを解除

### Amazon アソシエイト

`public/index.html` 内の `YOUR_AFFILIATE_TAG` をあなたのアソシエイトタグに置換。

## ライセンス

All Rights Reserved.

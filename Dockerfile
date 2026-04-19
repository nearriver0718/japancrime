FROM node:22-alpine

WORKDIR /app

# package.jsonをコピーして依存関係をインストール
COPY package*.json ./
RUN npm ci --only=production

# アプリのソースをコピー
COPY . .

# データディレクトリを作成（SQLiteファイル用）
RUN mkdir -p /data

# ポート公開
EXPOSE 3000

# 起動コマンド
CMD ["node", "server.js"]

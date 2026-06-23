# Ledger Lite

個人事業向けの、シンプルな複式簿記（複式記帳）の Web アプリです。
勘定科目・補助科目にもとづく仕訳の入力と、ダッシュボードでの残高・損益の
集計表示を行います。ローカル環境での個人利用を想定しています
（公開デプロイやマルチユーザー運用は当面の対象外です）。

## 特徴

- 複式簿記のドメインに沿った構成（勘定科目 / 補助科目 / 仕訳ヘッダー / 仕訳明細）
- ダッシュボードで「今月の損益」「科目別残高」「最近の仕訳」を表示
- 仕訳入力フォーム（借方・貸方を複数行で入力。貸借一致や科目の整合を検証して保存。スマホ対応）
- メールアドレス＋パスワードによるログイン認証
- 金額は円単位の整数で保持し、集計の丸め誤差が出ない設計
- 残高はテーブルに持たず、仕訳明細から都度集計

## スクリーンショット

![ダッシュボード](./docs/screenshot-dashboard.png)

ダッシュボードでは、今月の損益・科目別残高・最近の仕訳を一覧できます
（画面はサンプルデータ）。

## 開発状況

本アプリは現在開発中です。現時点では、勘定科目の整備・ダッシュボード表示・
仕訳の入力までを実装しています。

実装済み:

- ログイン / ログアウト（メールアドレス＋パスワード認証）
- ホーム画面のダッシュボード（今月の損益・科目別残高・最近の仕訳の表示）
- 仕訳の入力フォーム（`/journal/new`。貸借一致・金額・科目の整合などを検証して保存）
- データモデル（勘定科目・補助科目・仕訳）と初期データ投入（seed）
- 残高・損益の集計ロジック、仕訳入力の検証ロジック

未実装（今後の予定）:

- 勘定科目・補助科目の管理画面（追加・編集）
- 仕訳の編集・削除
- 帳簿・レポート（試算表の拡充、総勘定元帳など）

## 技術構成

本アプリは以下の主なライブラリを使用しています。

- Next.js（16 系・App Router）: Web フレームワーク（React ベース、Server Components）
- React / React DOM: UI
- Prisma（`@prisma/client` ＋ `@prisma/adapter-better-sqlite3`）: ORM。SQLite を driver adapter 経由で利用
- better-sqlite3: SQLite ドライバ
- Auth.js v5（`next-auth`）: 認証。Credentials provider・JWT セッション
- bcryptjs: パスワードのハッシュ化
- zod: 入力バリデーション
- Tailwind CSS（v4）: CSS フレームワーク
- dotenv: 環境変数の読み込み
- server-only: サーバー専用モジュールがクライアントへ混入するのを防止
- Vitest: テスト（純粋ロジックの単体テスト＋実 DB を使う統合テスト）
- tsx: TypeScript スクリプトの実行（seed など）
- ESLint（`eslint-config-next`）: Lint
- TypeScript: 言語

## 動作環境

- Node.js 20 以上を推奨します。

## セットアップ

プロジェクトを clone し、アプリのトップディレクトリで以下を実行します。

### 1. 依存パッケージのインストール

```bash
$ npm install
```

### 2. 環境変数ファイル（.env）の作成

トップディレクトリに `.env` を作成し、以下を設定します
（詳細は「使用する環境変数」を参照）。

```bash
DATABASE_URL="file:./dev.db"
AUTH_SECRET="（openssl rand -base64 32 で生成した値）"
SEED_EMAIL="you@example.com"
SEED_DISPLAY_NAME="あなたの表示名"
SEED_PASSWORD_HASH="（後述の方法で生成した bcrypt ハッシュ）"
```

`AUTH_SECRET` は次のコマンドで生成できます。

```bash
$ openssl rand -base64 32
```

`SEED_PASSWORD_HASH` は、ログインに使う平文パスワードを bcrypt
（コスト 12）でハッシュ化した値です。次のコマンドで生成し、出力された
`$2b$...` の文字列を設定してください。

```bash
$ node -e "require('bcryptjs').hash('ここに平文パスワード', 12).then(console.log)"
```

### 3. データベースの作成と初期データ投入

```bash
$ npx prisma migrate dev   # スキーマを反映して dev.db を作成
$ npx prisma db seed       # ユーザーと標準勘定科目を投入
```

開発用のサンプル仕訳（ダッシュボード確認用のダミー取引）も入れる場合は、
続けて次を実行します（本番では不要）。

```bash
$ npm run seed:sample
```

### 4. 開発サーバーの起動

```bash
$ npm run dev
```

その後 Web ブラウザで [http://localhost:3000](http://localhost:3000)
にアクセスし、`SEED_EMAIL` と、ハッシュ化のもとにした平文パスワードで
ログインしてください。

## 使用する環境変数

- `DATABASE_URL`: SQLite データベースファイルの場所。例: `file:./dev.db`
- `AUTH_SECRET`: Auth.js（NextAuth）のセッション署名用シークレット。
  `openssl rand -base64 32` で生成します。
- `SEED_EMAIL`: seed で作成するユーザーのログイン ID（メールアドレス）。
- `SEED_DISPLAY_NAME`: seed で作成するユーザーの表示名（任意）。
- `SEED_PASSWORD_HASH`: seed で作成するユーザーのパスワード（bcrypt
  ハッシュ済み・コスト 12）。

> `.env` は秘密情報を含むため、リポジトリにはコミットしません
> （`.gitignore` 済み）。

## データベース

テーブル仕様は [`DATABASE.md`](./DATABASE.md) に、実体のスキーマは
`prisma/schema.prisma` に記載しています。

よく使う操作:

```bash
$ npx prisma migrate dev      # マイグレーションの作成・適用
$ npx prisma db seed          # ユーザー・標準勘定科目の投入
$ npm run seed:sample         # 開発用サンプル仕訳の投入（任意）
$ npx prisma studio           # GUI で DB を閲覧（任意）
```

データベースを初期化してやり直す場合は `npx prisma migrate reset` を
使います（dev.db を作り直すため、データは消えます）。

## テスト

アプリのトップディレクトリで以下を実行します。

```bash
$ npm test          # watch モードで実行
$ npm run test:run  # 一度だけ実行（CI 向け）
```

テストは Vitest を使用しています。純粋ロジックの単体テストに加え、
Prisma を通した統合テストでは一時的な `test.db` を作成して使用します
（`dev.db` には影響しません）。

## Lint

```bash
$ npm run lint
```

ESLint（`eslint-config-next`）で静的解析を行います。

## ビルドと本番起動

```bash
$ npm run build   # 本番ビルド
$ npm start       # ビルド済みアプリの起動
```

## ディレクトリ構成（主なもの）

```
app/                 Next.js App Router（ページ・ルート）
  page.tsx           ダッシュボード（トップページ）
  journal/new/       仕訳入力フォーム（ページ・フォーム・Server Action）
  login/             ログインページ
  api/auth/          Auth.js のルートハンドラ
lib/
  ledger/            残高・損益の集計（ドメインの純粋ロジック）
  journal/           仕訳の検証・保存・取得クエリ
  prisma.ts          Prisma クライアント
  session.ts         セッション確認
  credentials.ts     ログイン照合ロジック
  password.ts        パスワードのハッシュ化・照合
prisma/
  schema.prisma      DB スキーマ
  migrations/        マイグレーション
  seed.ts            本番用 seed（ユーザー・勘定科目）
  seed-sample.ts     開発用サンプル仕訳 seed
tests/               テスト設定・統合テスト
auth.ts              Auth.js の設定
DATABASE.md          DB テーブルの仕様
```

## 想定用途と制約

- ローカル環境での**個人利用**を前提としています。
- 公開インターネットへのデプロイや、複数ユーザーでの同時運用は現状の
  対象外です。公開する場合は、認証・権限・秘密情報管理などを別途
  見直してください。

## ライセンス

[MIT License](./LICENSE) の下で公開しています。

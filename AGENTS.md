# Ledger Lite

個人事業向けの簡単な複式簿記アプリ。ローカル環境での個人利用を想定している
（公開デプロイやマルチユーザー運用は当面の対象外）。ローカル運用ながら、
アカウント名（メールアドレス）とパスワードによる認証機能を備える。

## ドメイン

複式簿記を扱うため、以下の用語を正しく前提にして実装すること。

- 勘定科目（account）／仕訳（journal entry）／借方（debit）・貸方（credit）
- 1 仕訳は借方合計と貸方合計が一致する（貸借平均の原理）

## 技術構成

- Next.js（改造版・16系。詳細は下記の注意書きを必ず参照）
- Prisma + SQLite（ローカルファイル DB）
- Auth.js v5（Credentials provider・JWT セッション）
- テスト: Vitest（純粋ロジックの単体テスト + 実 test.db を使う統合テスト）

## よく使うコマンド

```bash
npm run dev                              # 開発サーバー（dev.db を使用）
npm run test:run                         # テストを一度だけ実行（npm test は watch）
npx vitest run lib/journal/form.test.ts  # 単一ファイルのテスト
npx vitest run -t "テスト名"              # 名前で絞ってテスト
npm run lint                             # ESLint（npx eslint app lib tests でも可）
npx tsc --noEmit                         # 型チェック
npm run build                            # 本番ビルド
npx prisma migrate dev                   # マイグレーション作成・適用（dev.db）
npx prisma db seed                       # ユーザー・標準勘定科目の投入
npm run seed:sample                      # 開発用サンプル仕訳の投入（本番では使わない）
```

本番 DB（`prod.db`）への適用は `npm run migrate:prod` だけを使うこと。
`prisma migrate dev` は DB リセット（全データ削除）を提案することがあるため、
`prod.db` に対して実行してはならない。

## アーキテクチャ

3 層構成。依存は上から下への一方向。

1. **`app/`** — ページ（Server Components）と、ルートごとの `actions.ts`
   （Server Action）。ページ・Server Action とも必ず冒頭で
   `verifySession()`（`lib/session.ts`）を呼ぶ。
2. **`lib/<ドメイン>/` の DB 層** — `queries.ts`（取得）と
   `manage.ts` / `create.ts`（書き込み）。`"server-only"` を import する。
   DB アクセスは常に `userId` でスコープする（`where: { id, userId }`）。
3. **純粋ロジック** — `lib/ledger/` 全体（集計・会計期間）と、各ドメインの
   `validation.ts` / `form.ts` / `carryover.ts`。DB に依存させないこと
   （単体テストの対象はこの層）。

ドメイン上の約束事:

- 金額は円単位の整数で持つ（丸め誤差を出さない）。
- 取引日は `YYYY-MM-DD` の文字列。辞書順＝日付順なので文字列比較で足りる。
- 残高はテーブルに持たず、仕訳明細（JournalLine）から都度集計する。
- 年度締め: 年を締めると翌年 1/1 付の繰越仕訳を自動生成する。締め済みの年
  （集計開始日 `getAggregationStart` より前）の仕訳と繰越仕訳は、作成・更新・
  削除を**書き込みの入り口**（`lib/journal/create.ts` など）で拒否する。
  UI 側の出し分けは補助にすぎない。

その他:

- Prisma クライアントは `generated/prisma/` に生成される。直接使わず
  `lib/prisma.ts` の `prisma` を import する。
- `.env` / `.env.production` は git 管理外で、AUTH_SECRET などの秘密情報を
  含む。コミットしないこと。
- `reference/` は git 管理外の調査メモ置き場。コミットするコードやドキュメント
  から参照しないこと。

## テスト

- テストケースは `test()` で書く（`it()` は使わない）。
- 既定は Node 環境。コンポーネントのテストはファイル先頭に
  `// @vitest-environment jsdom` を書いて切り替える。
- 統合テスト（`tests/integration/`）は実ファイルの `test.db` を使うため
  直列実行になっている（`dev.db` には影響しない）。

## データベース

テーブルの仕様は `DATABASE.md` に随時記載していく。スキーマやデータ構造に
関わる作業の前に `DATABASE.md` を参照し、実装と齟齬がないか確認すること。
実体のスキーマは `prisma/schema.prisma`。

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

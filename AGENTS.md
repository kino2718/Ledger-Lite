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

## データベース

テーブルの仕様は `DATABASE.md` に随時記載していく。スキーマやデータ構造に
関わる作業の前に `DATABASE.md` を参照し、実装と齟齬がないか確認すること。
実体のスキーマは `prisma/schema.prisma`。

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

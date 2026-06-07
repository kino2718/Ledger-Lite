使用するデータベースは sqlite とする。

### テーブル一覧

| テーブル | 役割 |
| --- | --- |
| `User` | ユーザー管理 |

### User

ユーザー管理。

| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PK, AUTOINCREMENT | 主キー（SQLite では自動採番のため INTEGER を使用） |
| `email` | VARCHAR | UNIQUE, NOT NULL | ログインID |
| `passwordHash` | VARCHAR | NOT NULL | ハッシュ化したパスワード |
| `displayName` | VARCHAR | | 表示名 |
| `createdAt` | TIMESTAMP | NOT NULL | 作成日時 |
| `updatedAt` | TIMESTAMP | NOT NULL | 更新日時 |

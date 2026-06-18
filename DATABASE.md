使用するデータベースは sqlite とする。

全テーブル共通の方針として、`id` は INTEGER 主キーで自動採番(AUTOINCREMENT)、
`createdAt` / `updatedAt` は作成・更新時に自動設定するものとする。

### テーブル一覧

| テーブル | 役割 |
| --- | --- |
| `User` | ユーザー管理 |
| `Account` | 勘定科目マスタ |
| `SubAccount` | 補助科目マスタ(`Account` の内訳) |
| `JournalEntry` | 仕訳ヘッダー(取引単位) |
| `JournalLine` | 仕訳明細(各行の借方/貸方) |

### User

ユーザー管理。

| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PK | 主キー |
| `email` | VARCHAR | UNIQUE, NOT NULL | ログインID |
| `passwordHash` | VARCHAR | NOT NULL | ハッシュ化したパスワード |
| `displayName` | VARCHAR | | 表示名 |
| `createdAt` | TIMESTAMP | NOT NULL | 作成日時 |
| `updatedAt` | TIMESTAMP | NOT NULL | 更新日時 |

### Account

勘定科目マスタ。損益計算書・貸借対照表に集計される単位。

| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PK | 主キー |
| `userId` | INTEGER | FK → `User.id`, NOT NULL | 所有ユーザー |
| `code` | VARCHAR | | 勘定科目コード(例: 1010) |
| `name` | VARCHAR | NOT NULL | 科目名(例: 現金、水道光熱費) |
| `accountType` | ENUM | NOT NULL | 科目分類(下記参照) |
| `isActive` | BOOLEAN | NOT NULL | 使用中フラグ(削除せず無効化)。既定は `true`(使用中) |
| `createdAt` | TIMESTAMP | NOT NULL | 作成日時 |
| `updatedAt` | TIMESTAMP | NOT NULL | 更新日時 |

#### `accountType` の値

| 値 | 意味 |
| --- | --- |
| `asset` | 資産 |
| `liability` | 負債 |
| `equity` | 純資産(元入金・事業主貸・事業主借など) |
| `revenue` | 収益 |
| `expense` | 費用 |

> 個人事業特有の純資産科目は `equity` として登録する。
> - 元入金: `owners capital`
> - 事業主貸: `owners drawings`
> - 事業主借: `owners contributions`

#### 一意制約

- `(userId, code)` を UNIQUE。同一ユーザー内で科目コードの重複を禁止する。
  `code` は NULL 可で、SQLite では NULL 同士は別物として扱われるため、
  コード未設定の科目が複数あっても問題ない。
- `(userId, name)` を UNIQUE。同一ユーザー内で同名科目の重複を禁止する。

### SubAccount

補助科目マスタ。勘定科目の内訳を分析するための単位
(例: 水道光熱費 → 電気・水道・ガス)。決算書には集計されない。

| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PK | 主キー |
| `accountId` | INTEGER | FK → `Account.id`, NOT NULL | 親の勘定科目(所有ユーザーもここから辿る) |
| `name` | VARCHAR | NOT NULL | 補助科目名(例: 電気、水道、ガス) |
| `isActive` | BOOLEAN | NOT NULL | 使用中フラグ。既定は `true`(使用中) |
| `createdAt` | TIMESTAMP | NOT NULL | 作成日時 |
| `updatedAt` | TIMESTAMP | NOT NULL | 更新日時 |

> `accountType` は持たせない。親の勘定科目の性質をそのまま引き継ぐため。

#### 一意制約

- `(accountId, name)` を UNIQUE。同一の勘定科目内で同名の補助科目の重複を
  禁止する(所有ユーザーは `accountId` 経由で一意に定まる)。

### JournalEntry

仕訳ヘッダー。1回の取引を表し、取引全体に共通する情報を持つ。

| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PK | 主キー |
| `userId` | INTEGER | FK → `User.id`, NOT NULL | 所有ユーザー |
| `entryDate` | VARCHAR | NOT NULL | 取引日(発生日)。`YYYY-MM-DD` 形式の文字列 |
| `description` | TEXT | | 摘要・メモ |
| `status` | ENUM | NOT NULL | 仕訳の状態(下記参照)。既定は `draft` |
| `createdAt` | TIMESTAMP | NOT NULL | 作成日時 |
| `updatedAt` | TIMESTAMP | NOT NULL | 更新日時 |

#### `status` の値

| 値 | 意味 |
| --- | --- |
| `draft` | 下書き(未確定)。自由に編集・削除してよい |
| `posted` | 確定済み。訂正は逆仕訳で行い、原則そのまま残す |

> **下書き/確定で扱いを分ける。** `draft` のうちは入力ミスを気軽に直せるよう
> 編集・物理削除を許す(復元・ゴミ箱は持たない)。`posted` にしたら会計記録
> として確定し、編集・削除は禁止。訂正は逆仕訳(元仕訳＋打消し仕訳)で行う。

### JournalLine

仕訳明細。1つの `JournalEntry` に対して2行以上ぶら下がる。複式簿記の本体。

| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PK | 主キー |
| `entryId` | INTEGER | FK → `JournalEntry.id`, NOT NULL | 所属する取引 |
| `lineNo` | INTEGER | NOT NULL | 取引内の表示順(1始まり) |
| `accountId` | INTEGER | FK → `Account.id`, NOT NULL | 勘定科目 |
| `subAccountId` | INTEGER | FK → `SubAccount.id`, NULL可 | 補助科目 |
| `side` | ENUM | NOT NULL | `debit`(借方) / `credit`(貸方) |
| `amount` | INTEGER | NOT NULL | 金額。円単位の整数で必ず正の値 |
| `taxCategory` | ENUM | NULL可 | 税区分(下記参照) |
| `lineMemo` | VARCHAR | NULL可 | 行ごとの補足 |

#### `side` の値

| 値 | 意味 |
| --- | --- |
| `debit` | 借方 |
| `credit` | 貸方 |

#### 一意制約

- `(entryId, lineNo)` を UNIQUE。同一取引内で行番号の重複を禁止し、表示順を
  一意に保つ。このインデックスは `entryId` 単独での明細取得も兼ねる。

#### `taxCategory` の値

| 値 | 意味 |
| --- | --- |
| `taxable_10` | 課税 10% |
| `taxable_8` | 課税 8%(軽減税率) |
| `tax_free` | 非課税 |
| `non_taxable` | 不課税 |

> 免税事業者のうちは `NULL` または `tax_free` で運用し、
> 課税事業者になったら集計ロジックを追加する想定。

### リレーション概要

```
User (1) ──< (N) Account
User (1) ──< (N) JournalEntry

Account (1) ──< (N) SubAccount
Account (1) ──< (N) JournalLine
SubAccount (1) ──< (N) JournalLine   (任意)

JournalEntry (1) ──< (N) JournalLine
```

### インデックス

Prisma は外部キーのスカラ列に自動でインデックスを張らないため、検索・集計で
使う列に明示的に張る。複合 UNIQUE 制約は先頭列のインデックスを兼ねるので、
それで賄える列は重複して張らない。

| テーブル | インデックス | 目的 |
| --- | --- | --- |
| `JournalEntry` | `(userId, entryDate)` | ユーザー単位＋期間での仕訳検索・一覧。`userId` 単独検索もこの複合で賄える |
| `JournalLine` | `(accountId)` | 勘定科目ごとの残高集計 |
| `JournalLine` | `(subAccountId)` | 補助科目ごとの内訳集計 |

> `SubAccount` は主に `accountId` 経由で参照され、それは `(accountId, name)` の
> UNIQUE で賄えるため追加のインデックスは設けない。

### 設計上の注意点

- **貸借一致の担保**: 1取引(`JournalEntry`)内で `debit` 合計 = `credit` 合計 となること。
  宣言的制約では表現しづらいため、保存時のトランザクションでアプリ側で検証する。
- **補助科目の整合性**: `JournalLine.subAccountId` が指す補助科目は、
  同じ行の `accountId` に属していなければならない。これも保存時に検証する。
- **所有ユーザーの一致**: `JournalLine.accountId` / `subAccountId` が指す科目は、
  その仕訳(`JournalEntry.userId`)の所有ユーザーに属していなければならない。
  他ユーザーの科目を参照させないよう保存時に検証する。
- **削除時の挙動(`onDelete`)**: 外部キーごとに明示する。
  - マスタ(`Account` / `SubAccount`)は原則削除せず `isActive=false` で無効化する。
  - `JournalLine` → `Account` / `SubAccount`: `Restrict`。仕訳から参照中の科目は
    削除させない(帳簿が参照先を失わないようにする)。
  - `Account` → `SubAccount`: `Restrict`。補助科目が残る勘定科目は削除させない。
  - `JournalEntry` → `JournalLine`: `Cascade`。仕訳ヘッダー削除で明細も連動削除。
  - `User` → `Account` / `JournalEntry`: `Restrict`。配下データを持つユーザーは
    削除させず、誤操作によるデータ消失を防ぐ。
- **金額は円単位の整数(`Int`)**: 日本円は最小単位が1円で小数を持たないため、
  金額は円単位の整数で保持する。`FLOAT` / `DOUBLE` は丸め誤差が出るため使わない。
  整数なので誤差が発生せず、`SUM()` 等の集計も完全に正確になる。
  Prisma の `Decimal` は SQLite で精度指定(`@db.Decimal(p,s)`)が使えず、
  NUMERIC 親和性により内部で REAL に化けうるため採らない。`BigInt` も検討したが、
  円の金額は `Number.MAX_SAFE_INTEGER`(約9,007兆)を超えず、かつ `bigint` は
  `JSON.stringify` で例外になる等の取り回しの悪さがあるため `Int`(number)を選ぶ。
  なお「必ず正の値」は SQLite/Prisma では宣言的制約にしづらいため、
  貸借一致などと同様に保存時にアプリ側で検証する。
- **下書き/確定で訂正方法を分ける**: `JournalEntry.status` が `draft` の間は
  編集・物理削除を自由に許す(復元手段は持たない)。`posted`(確定)後は
  会計記録のため編集・削除を禁止し、訂正は逆仕訳で行う。論理削除は採らないため、
  帳簿・残高集計は存在する全明細をそのまま合算すればよい(逆仕訳が差引ゼロになる)。
  `JournalEntry` の物理削除時は明細(`JournalLine`)も連動削除する。
- **取引日は `YYYY-MM-DD` 文字列**: `entryDate` は時刻に意味のない暦日なので、
  Prisma の `DateTime`(時刻つき)ではなく ISO 形式の文字列で持つ。タイムゾーン
  由来の日付ズレが原理的に起きず、辞書順=日付順のため範囲検索やソートも素直。
  日付演算が要る場合はアプリ側の日付ライブラリで扱う。
- **残高はテーブルに持たない**: 各科目の残高は `JournalLine` から都度集計する。
  パフォーマンスが問題になったら、確定済み月次の集計テーブルをキャッシュとして別途持つ。

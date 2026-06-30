// 集計ロジック用の型。Prisma の生成型には依存させず、ドメインの素の型として持つ。
// 値は DB の enum（schema.prisma）と一致させているため、そのままデータを渡せる。

export type AccountType =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "expense";

export type Side = "debit" | "credit";

// 残高集計に必要な最小限の仕訳明細。
// accountType は損益などのグルーピング用、normalSide は符号（通常残高方向）の判定用。
export type BalanceLine = {
  accountId: number;
  accountType: AccountType;
  normalSide: Side;
  side: Side;
  amount: number;
};

// 科目ごとの残高（通常残高方向を正とする）。
export type AccountBalance = {
  accountId: number;
  accountType: AccountType;
  balance: number;
};

// 損益サマリ。
export type ProfitLoss = {
  revenue: number;
  expense: number;
  net: number;
};

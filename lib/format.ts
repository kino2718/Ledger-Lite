// 表示用の整形ヘルパー。サーバー・クライアントのどちらからも使う純粋関数。

/** 金額を「¥1,234」形式に整形する。 */
export const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig.json の paths（@/* → ./*）をテスト実行時にも解決させる。
  // Vite がネイティブ対応しているため専用プラグインは不要。
  resolve: { tsconfigPaths: true },
  test: {
    // 既定は Node。React コンポーネントの描画テストは、ファイル先頭の
    // `// @vitest-environment jsdom` で jsdom に切り替える（個別指定）。
    environment: "node",

    // 統合テストはファイルベースの test.db を共有するため、
    // 並列ファイル実行だと DB がぶつかる。当面は直列実行で安全側に倒す。
    fileParallelism: false,

    // テストワーカーへ渡す環境変数。lib/prisma.ts は import "dotenv/config"
    // で .env を読むが、dotenv は既存の値を上書きしないため、ここで先に
    // DATABASE_URL を test.db に向けておけば dev.db を汚さずに済む。
    env: {
      DATABASE_URL: "file:./test.db",
    },

    // 全テスト開始前に一度だけ test.db のスキーマを初期化する。
    globalSetup: ["./tests/global-setup.ts"],

    // 各テストファイルの実行前に読み込まれる。
    // setup.ts: テーブルを空にする / setup-dom.ts: jest-dom マッチャー登録。
    setupFiles: ["./tests/setup.ts", "./tests/setup-dom.ts"],

    // テスト対象から除外するパス。
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "**/generated/**",
      "**/e2e/**",
    ],
  },
});

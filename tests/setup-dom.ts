// jest-dom のマッチャー（toBeInTheDocument / toBeDisabled / toHaveValue 等）を
// Vitest の expect に登録する。コンポーネントテスト（jsdom）で使う。
// node 環境のテストでは未使用のまま無害。
import "@testing-library/jest-dom/vitest";

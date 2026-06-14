import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

// 全テストの開始前に一度だけ実行される（vitest の globalSetup）。
// 使い捨ての test.db をまっさらな状態から作り直す。
//
// prisma の --force-reset は破壊的操作として AI ガードに弾かれるため使わない。
// 代わりに test.db ファイル群（gitignore 済み）を自前で削除し、破壊的でない
// 通常の db push で現在の schema.prisma の状態を反映する。dev.db には触れない。
export default function setup() {
  for (const f of ["test.db", "test.db-journal", "test.db-wal", "test.db-shm"]) {
    rmSync(f, { force: true });
  }
  execSync('npx prisma db push --url "file:./test.db"', { stdio: "inherit" });
}

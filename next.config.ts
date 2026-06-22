import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

// このマシンの非内部 IPv4 アドレスを返す。
// 開発サーバーへ LAN の IP（スマホ等の実機確認）からアクセスできるよう、
// allowedDevOrigins に自動登録するために使う。固定 IP をハードコードせず、
// 利用者・環境（IP の違い）を問わず動く。開発サーバーでのみ参照される設定。
function localNetworkOrigins(): string[] {
  const origins: string[] = [];
  for (const nets of Object.values(networkInterfaces())) {
    for (const net of nets ?? []) {
      if (net.family === "IPv4" && !net.internal) {
        origins.push(net.address);
      }
    }
  }
  return origins;
}

const nextConfig: NextConfig = {
  // 既定では localhost 以外のオリジンからの dev 用リクエストはブロックされる。
  // LAN 内の実機（スマホ等）から動作確認できるよう、自機の IP を許可する。
  allowedDevOrigins: localNetworkOrigins(),
};

export default nextConfig;

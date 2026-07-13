// SEED_PASSWORD_HASH に設定する bcrypt ハッシュを生成するスクリプト。
// 実行: npm run hash:password
//
// パスワードは実行後に聞かれる（入力中は画面に表示されない）。
// コマンドラインに平文を書かないので、シェルの履歴に残らない。
// ハッシュ方式は lib/password.ts（ログイン照合と同じ bcryptjs・コスト 12）。
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { hashPassword } from "@/lib/password";

// 入力を画面に表示せずに 1 行ずつ読むリーダー。
// - echo を止めるため、readline の出力先を「何も書かない」ストリームにし、
//   プロンプトは自前で stderr に出す。
// - rl.question は「質問していない瞬間」に届いた行を捨ててしまい、
//   パイプ入力（テストなど）でまとめて行が届くと取りこぼす。そこで
//   line イベントをキューに溜め、ask が順に取り出す方式にする。
function createHiddenLineReader() {
  const muted = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const rl = createInterface({
    input: process.stdin,
    output: muted,
    terminal: true,
  });

  const buffered: string[] = [];
  let waiter: {
    resolve: (line: string) => void;
    reject: (e: Error) => void;
  } | null = null;
  let closed = false;
  const interrupted = () => new Error("入力が中断されました。");

  rl.on("line", (line) => {
    if (waiter) {
      const w = waiter;
      waiter = null;
      w.resolve(line);
    } else {
      buffered.push(line);
    }
  });
  // Ctrl+D や入力の終端。答えを待っていたら中断として扱う。
  rl.on("close", () => {
    closed = true;
    if (waiter) {
      const w = waiter;
      waiter = null;
      w.reject(interrupted());
    }
  });

  return {
    async ask(promptText: string): Promise<string> {
      process.stderr.write(promptText);
      let line: string;
      if (buffered.length > 0) {
        line = buffered.shift()!;
      } else if (closed) {
        throw interrupted();
      } else {
        line = await new Promise<string>((resolve, reject) => {
          waiter = { resolve, reject };
        });
      }
      // echo が無いので Enter の改行も表示されない。ここで補う。
      process.stderr.write("\n");
      return line;
    },
    close() {
      rl.close();
    },
  };
}

async function main() {
  const reader = createHiddenLineReader();
  try {
    const password = await reader.ask("パスワード: ");
    if (password === "") {
      throw new Error("パスワードが空です。");
    }
    const again = await reader.ask("パスワード（確認）: ");
    if (password !== again) {
      throw new Error("2 回の入力が一致しません。やり直してください。");
    }

    // 案内は stderr、ハッシュだけを stdout に出す（コピーしやすいように）。
    process.stderr.write(
      "この値を .env の SEED_PASSWORD_HASH に設定してください:\n",
    );
    console.log(await hashPassword(password));
  } finally {
    reader.close();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});

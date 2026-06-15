import { describe, expect, test } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("password", () => {
  test("ハッシュは平文とは異なる文字列になる", async () => {
    const hash = await hashPassword("password1");
    expect(hash).not.toBe("password1");
    // bcrypt のハッシュは "$2a$" / "$2b$" などで始まる。
    expect(hash).toMatch(/^\$2[aby]\$/);
  });

  test("同じ平文でもソルトによりハッシュは毎回変わる", async () => {
    const a = await hashPassword("password1");
    const b = await hashPassword("password1");
    expect(a).not.toBe(b);
  });

  test("正しい平文なら verify は true", async () => {
    const hash = await hashPassword("password1");
    expect(await verifyPassword("password1", hash)).toBe(true);
  });

  test("誤った平文なら verify は false", async () => {
    const hash = await hashPassword("password1");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});

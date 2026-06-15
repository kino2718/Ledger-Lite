import type { DefaultSession } from "next-auth";

// Auth.js の型を拡張し、session.user.id と JWT.id を型安全に扱えるようにする。
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
  }
}

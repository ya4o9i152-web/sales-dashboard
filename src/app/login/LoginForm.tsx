"use client";

import { useActionState } from "react";
import { signIn } from "./actions";

export function LoginForm() {
  const [error, action, pending] = useActionState(signIn, null);
  return (
    <form action={action} className="mt-6 space-y-4">
      <label className="block text-sm">
        メールアドレス
        <input name="email" type="email" required autoComplete="email" className="mt-1 w-full rounded-md border border-line px-3 py-2" />
      </label>
      <label className="block text-sm">
        パスワード
        <input name="password" type="password" required autoComplete="current-password" className="mt-1 w-full rounded-md border border-line px-3 py-2" />
      </label>
      {error && <p className="text-sm text-down">{error}</p>}
      <button disabled={pending} className="w-full rounded-md bg-navy py-2.5 font-medium text-white disabled:opacity-60">
        {pending ? "ログイン中…" : "ログイン"}
      </button>
    </form>
  );
}

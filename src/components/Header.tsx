import Link from "next/link";
import { signOut } from "@/app/login/actions";
import type { CurrentUser } from "@/lib/data";

export function Header({ user, current }: { user: CurrentUser; current: "dashboard" | "upload" }) {
  return (
    <header className="bg-navy text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
        <Link href="/" className="font-bold tracking-wide">
          売上ダッシュボード
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          {user.role === "editor" && current === "dashboard" && (
            <Link href="/upload" className="rounded-md bg-white px-3 py-1.5 font-medium text-navy">
              CSVを取り込む
            </Link>
          )}
          {current === "upload" && (
            <Link href="/" className="underline-offset-4 hover:underline">
              ダッシュボードへ
            </Link>
          )}
          <span className="hidden text-white/80 sm:inline">
            {user.displayName || "ログイン中"}（{user.role === "editor" ? "担当者" : "閲覧のみ"}）
          </span>
          <form action={signOut}>
            <button className="text-white/80 underline-offset-4 hover:underline">ログアウト</button>
          </form>
        </nav>
      </div>
    </header>
  );
}

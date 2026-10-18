import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * ページを表示する前にログインのセッションを更新し、未ログインならログイン画面へ送る。
 * ここでの判定は画面遷移のためだけ。データの閲覧制限はデータベースの RLS が守る。
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const isLoginPage = request.nextUrl.pathname === "/login";
  if (!data?.claims && !isLoginPage) return NextResponse.redirect(new URL("/login", request.url));
  if (data?.claims && isLoginPage) return NextResponse.redirect(new URL("/", request.url));
  return response;
}

export const config = {
  // 静的ファイルとCronの受け口は除く
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/cron).*)"],
};

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * ログイン中の利用者として Supabase に接続する（RLS が効く）。
 * サービスロールのキーは使わない：権限（editor / viewer）の判定をデータベース側にも任せるため。
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component からは書き込めない。セッションの更新は proxy.ts が行う
        }
      },
    },
  });
}

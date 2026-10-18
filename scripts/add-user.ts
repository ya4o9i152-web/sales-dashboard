/**
 * 利用者を登録する（管理者が手元で実行する。画面からの新規登録は受け付けない）。
 *
 *   npm run add-user -- <メールアドレス> <表示名> <editor|viewer>
 *
 * 初期パスワードを表示するので、本人に安全な方法で伝える。
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const [email, displayName, role] = process.argv.slice(2);
  if (!email || !displayName || !["editor", "viewer"].includes(role)) {
    console.error("使い方: npm run add-user -- <メールアドレス> <表示名> <editor|viewer>");
    process.exit(1);
  }
  const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

  const password = randomBytes(12).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error) throw new Error(`登録できませんでした: ${error.message}`);

  // profiles はトリガーが viewer で作る。editor のときだけ書き換える
  if (role === "editor") {
    const { error: roleError } = await admin.from("profiles").update({ role }).eq("id", data.user.id);
    if (roleError) throw new Error(`権限を設定できませんでした: ${roleError.message}`);
  }
  console.log(`登録しました: ${email}（${displayName}／${role === "editor" ? "担当者" : "閲覧のみ"}）`);
  console.log(`初期パスワード: ${password}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

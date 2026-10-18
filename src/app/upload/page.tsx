import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { getCurrentUser } from "@/lib/data";
import { UploadForm } from "./UploadForm";

export default async function UploadPage() {
  const user = await getCurrentUser();
  if (user.role !== "editor") redirect("/");
  return (
    <>
      <Header user={user} current="upload" />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-xl font-bold">CSVを取り込む</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Shopifyから書き出した売上CSVを選んでください。CSVに含まれる月のデータは、新しい内容に入れ替わります（同じ月を上げ直しても二重に数えません）。
        </p>
        <UploadForm />
      </main>
    </>
  );
}

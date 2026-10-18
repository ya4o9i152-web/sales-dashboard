import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-navy-50 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm">
        <h1 className="text-lg font-bold text-navy">売上ダッシュボード</h1>
        <p className="mt-1 text-sm text-ink-muted">社内の方のみご利用いただけます</p>
        <LoginForm />
      </div>
    </main>
  );
}

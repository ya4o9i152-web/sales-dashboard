"use client";

import { useState, useTransition } from "react";
import { generateReport } from "@/app/upload/actions";

export function RegenerateButton({ snapshotId, label }: { snapshotId: string; label: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="text-down">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await generateReport(snapshotId);
            if (!result.ok) setError(result.message);
          })
        }
        className="mt-2 rounded-md border border-navy px-3 py-1.5 text-sm font-medium text-navy disabled:opacity-60"
      >
        {pending ? "AIが作成中…（30秒〜1分）" : label}
      </button>
    </span>
  );
}

"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** A filter form's Apply button: shows it's working the moment it's pressed, until the results arrive. */
export function FilterSubmit({ className }: { className: string }) {
  const [busy, setBusy] = useState(false);
  const params = useSearchParams();
  const path = usePathname();
  useEffect(() => setBusy(false), [params, path]);
  return (
    <button className={className} onClick={() => setBusy(true)} aria-busy={busy}>
      {busy ? (
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-r-transparent" />
          Loading…
        </span>
      ) : (
        "Apply"
      )}
    </button>
  );
}

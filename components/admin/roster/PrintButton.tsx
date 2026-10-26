"use client";

import { btn } from "@/components/admin/ui";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className={btn.primary}>
      Print
    </button>
  );
}

"use client";

/** Print (or save as PDF) the what-to-bring list. */
export function PrintList() {
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex h-11 items-center rounded-full border border-ink/25 px-6 text-[0.88rem] text-ink transition-colors hover:border-ink print:hidden">
      Print this list
    </button>
  );
}

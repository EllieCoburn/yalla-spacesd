/**
 * Shown the instant you open another admin page, while the server prepares it, so a click is
 * acknowledged straight away. The sidebar and header stay put; only the page area shows this.
 */
export default function AdminLoading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-[fade_200ms_ease-out_120ms_both]">
      <div className="mb-6 lg:mb-8">
        <div className="h-8 w-56 rounded-md bg-ink/[0.07] motion-safe:animate-pulse" />
        <div className="mt-3 h-4 w-80 max-w-full rounded bg-ink/[0.05] motion-safe:animate-pulse" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-ink/10 bg-[#fffefb] p-5">
            <div className="h-4 w-32 rounded bg-ink/[0.07] motion-safe:animate-pulse" />
            <div className="mt-4 space-y-2.5">
              <div className="h-3 w-full rounded bg-ink/[0.05] motion-safe:animate-pulse" />
              <div className="h-3 w-5/6 rounded bg-ink/[0.05] motion-safe:animate-pulse" />
              <div className="h-3 w-2/3 rounded bg-ink/[0.05] motion-safe:animate-pulse" />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-ink/10 bg-[#fffefb] p-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4 border-b border-ink/5 py-3 last:border-0">
            <div className="h-3 w-24 rounded bg-ink/[0.06] motion-safe:animate-pulse" />
            <div className="h-3 flex-1 rounded bg-ink/[0.05] motion-safe:animate-pulse" />
            <div className="h-5 w-16 rounded-full bg-ink/[0.06] motion-safe:animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

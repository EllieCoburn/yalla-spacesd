import type { ReactNode } from "react";

/**
 * Review markers. While the site is being refined, content that still needs
 * Yalla's facts is flagged so nothing invented slips through to launch.
 * Set NEXT_PUBLIC_HIDE_DRAFT_MARKERS=true to hide the markers.
 */
const hidden = process.env.NEXT_PUBLIC_HIDE_DRAFT_MARKERS === "true";

export function ToConfirm({ children = "To confirm" }: { children?: ReactNode }) {
  if (hidden) return null;
  return (
    <span className="eyebrow ml-2 inline-flex translate-y-[-1px] items-center gap-1.5 rounded-full border border-dashed border-oxblood/50 bg-chalk/90 px-2 py-0.5 text-[0.6rem] tracking-[0.18em] text-oxblood">
      <span className="h-1 w-1 rounded-full bg-oxblood" />
      {children}
    </span>
  );
}

export function Draft({ children, note }: { children: ReactNode; note?: string }) {
  if (hidden) return <>{children}</>;
  return (
    <div className="relative rounded-sm outline-1 outline-offset-8 outline-dashed outline-oxblood/35">
      <span className="eyebrow absolute -top-[1.9rem] right-0 rounded-full bg-chalk px-2 py-0.5 text-[0.58rem] tracking-[0.18em] text-oxblood">
        Draft{note ? ` · ${note}` : ""}
      </span>
      {children}
    </div>
  );
}

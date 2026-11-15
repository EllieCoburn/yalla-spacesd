import Link from "next/link";
import { announcement } from "@/content/site";

/** Today in San Diego, as YYYY-MM-DD. */
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());

export function showAnnouncement() {
  return !!announcement && today() <= announcement.until;
}

/** A slim strip above the header. The whole strip is the link. */
export function AnnouncementBar() {
  if (!announcement || !showAnnouncement()) return null;
  return (
    <Link
      href={announcement.href}
      className="group fixed inset-x-0 top-0 z-[60] flex h-10 items-center justify-center gap-3 bg-blue px-4 text-[0.8rem] tracking-[0.03em] text-chalk transition-colors duration-500 hover:bg-blue-deep"
    >
      <span className="hidden sm:inline">{announcement.text}</span>
      <span className="sm:hidden">{announcement.short}</span>
      <span aria-hidden className="text-chalk/50">·</span>
      <span className="font-medium underline decoration-chalk/40 underline-offset-4 group-hover:decoration-chalk">
        {announcement.linkLabel}
        <span aria-hidden className="ml-1 inline-block transition-transform duration-500 group-hover:translate-x-0.5">→</span>
      </span>
    </Link>
  );
}

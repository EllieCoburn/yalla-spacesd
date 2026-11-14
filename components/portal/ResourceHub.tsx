import Link from "next/link";
import { PORTAL_RESOURCES } from "@/content/portal-resources";

/** Guides and policies, kept apart from the portal's main sections. */
export function ResourceHub({ heading = true, limit }: { heading?: boolean; limit?: number }) {
  const list = limit ? PORTAL_RESOURCES.slice(0, limit) : PORTAL_RESOURCES;
  return (
    <section aria-labelledby={heading ? "resources-title" : undefined}>
      {heading ? (
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 id="resources-title" className="eyebrow text-ink-soft">
            Family resources
          </h2>
          {limit && PORTAL_RESOURCES.length > limit ? (
            <Link href="/portal/resources" className="text-[0.85rem] text-blue underline-offset-4 hover:underline">
              All resources
            </Link>
          ) : null}
        </div>
      ) : null}
      <ul className="mt-5 grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {list.map((r) => (
          <li key={r.key} className="bg-chalk">
            <Link href={r.href} className="group flex h-full flex-col p-6 transition-colors hover:bg-paper">
              <span className="eyebrow text-[0.58rem] text-ink-soft">{r.eyebrow}</span>
              <span className="display mt-2 text-[1.2rem]">{r.title}</span>
              <span className="mt-1.5 flex-1 text-[0.85rem] text-ink-soft">{r.description}</span>
              <span className="mt-4 text-[0.82rem] text-blue underline-offset-4 group-hover:underline">{r.cta}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

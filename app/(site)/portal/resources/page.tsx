import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ResourceHub } from "@/components/portal/ResourceHub";
import { isDbConfigured } from "@/lib/db";
import { PORTAL_OPEN_PREVIEW } from "@/lib/portal-preview";
import { getGuardian } from "../session";

export const metadata: Metadata = { title: "Family resources", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Resources() {
  const g = isDbConfigured() ? await getGuardian() : null;
  if (!g && !PORTAL_OPEN_PREVIEW) redirect("/portal?signin=1&next=/portal/resources");
  return (
    <div className="pt-28 pb-24 lg:pt-36">
      <div className="shell">
        <Link href="/portal/home" className="eyebrow text-ink-soft hover:text-ink">
          ← Family Portal
        </Link>
        <h1 className="display mt-6 text-[clamp(2.4rem,1.8rem+2.4vw,4rem)]">
          Family <em>resources.</em>
        </h1>
        <p className="mt-5 max-w-xl text-ink-soft">Guides and policies for your time at Yalla, all in one place.</p>
        <div className="mt-10">
          <ResourceHub heading={false} />
        </div>
      </div>
    </div>
  );
}

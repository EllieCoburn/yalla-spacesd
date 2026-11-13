import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CreateAccountForm } from "@/components/portal/PortalForms";
import { isDbConfigured } from "@/lib/db";
import { safeNextPath } from "@/lib/family-auth";
import { getGuardian } from "../session";

export const metadata: Metadata = { title: "Create your family account", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function JoinPortal({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const configured = isDbConfigured();
  if (configured && (await getGuardian())) redirect(safeNextPath(sp.next));

  return (
    <section className="pt-32 pb-24 lg:pt-40">
      <div className="shell">
        <div className="mx-auto max-w-xl">
          <p className="eyebrow text-ink-soft">Family Portal</p>
          <h1 className="display mt-6 text-[clamp(2.6rem,2rem+2vw,3.6rem)]">
            Create your <em>family account.</em>
          </h1>
          <p className="mt-5 text-ink-soft">Book Yalla experiences, keep your children’s details in one place, and manage everything from any device.</p>
          {configured ? (
            <CreateAccountForm next={sp.next} />
          ) : (
            <p className="mt-10 text-ink-soft">Family accounts open soon. In the meantime, we’re happy to help at hello@yallaspacesd.com.</p>
          )}
          <p className="mt-10 text-[0.95rem] text-ink-soft">
            Already have an account?{" "}
            <Link href={`/portal${sp.next ? `?next=${encodeURIComponent(sp.next)}` : ""}`} className="text-ink underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}

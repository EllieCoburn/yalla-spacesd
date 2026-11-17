import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SignedDocument } from "@/components/forms/SignedDocument";
import { getDb, isDbConfigured } from "@/lib/db";
import { signedCopy } from "@/lib/ops/forms";
import { getGuardian } from "../../../session";

export const metadata: Metadata = { title: "Your signed agreement", robots: { index: false } };
export const dynamic = "force-dynamic";

const when = (d: Date) => d.toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "long", timeStyle: "short" });

/**
 * A signed agreement or form, exactly as it was signed (that version's text, with the family's
 * initials, choices and signature), with working links to the Illness Policy, Family Handbook and more.
 */
export default async function SignedCopy({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isDbConfigured()) notFound();
  const g = await getGuardian();
  if (!g) redirect(`/portal?signin=1&next=${encodeURIComponent(`/portal/forms/signed/${id}`)}`);
  const copy = await signedCopy(getDb(), g, id);
  if (!copy) notFound();

  return (
    <section className="pt-32 pb-24 lg:pt-40">
      <div className="shell">
        <div className="mx-auto max-w-3xl">
          <Link href="/portal/home?tab=forms" className="eyebrow text-ink-soft hover:text-ink">
            ← Forms
          </Link>
          <h1 className="display mt-6 text-[clamp(2rem,1.6rem+1.6vw,3rem)]">{copy.title}</h1>
          <p className="mt-3 text-[0.92rem] text-ink-soft">
            {copy.childName ? `For ${copy.childName} · ` : ""}
            {copy.bookingReference ? `Booking ${copy.bookingReference} · ` : ""}
            Version {copy.version} · Signed {when(copy.signedAt)}
            {copy.signerName ? ` by ${copy.signerName}` : ""}
          </p>

          <div className="mt-10 border border-line bg-paper p-6 sm:p-9">
            <SignedDocument fields={copy.fields} answers={copy.answers} body={copy.body} kind={copy.kind} signatureText={copy.signatureText} signerName={copy.signerName} signedAt={copy.signedAt} />
          </div>
        </div>
      </div>
    </section>
  );
}

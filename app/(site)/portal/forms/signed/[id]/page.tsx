import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Markup } from "@/components/faq/FaqAnswer";
import { getDb, isDbConfigured } from "@/lib/db";
import { isShown } from "@/lib/forms/fields";
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
  const a = copy.answers;

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

          <div className="mt-10 space-y-5 border border-line bg-paper p-6 text-[0.95rem] leading-relaxed text-ink-soft sm:p-9">
            {/* A form's opening text is part of what was agreed (e.g. the sunscreen standards); an agreement's is only "please read and sign". */}
            {copy.fields.length === 0 || (copy.kind !== "policy" && copy.body.trim()) ? (
              <div className="space-y-3 border-b border-line pb-6">
                <Markup text={copy.body} />
              </div>
            ) : null}
            {copy.fields
              .filter((f) => isShown(f, a))
              .map((f) => {
                if (f.type === "heading") return <h2 key={f.id} className="pt-3 font-serif text-[1.3rem] text-ink">{f.text}</h2>;
                if (f.type === "info")
                  return (
                    <div key={f.id} className="space-y-3">
                      <Markup text={f.text} />
                    </div>
                  );
                if (f.type === "initials")
                  return (
                    <div key={f.id} className="flex items-center justify-between gap-4 rounded-lg border border-ink/10 bg-chalk p-3">
                      <p className="text-[0.88rem] text-ink">{f.label}</p>
                      {a[f.id]?.startsWith("data:image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a[f.id]} alt="Initials" className="h-12 w-auto shrink-0" />
                      ) : (
                        <span className="text-[0.8rem] text-ink-soft">Not initialed</span>
                      )}
                    </div>
                  );
                if (f.type === "agree")
                  return (
                    <p key={f.id} className="flex items-start gap-2.5 text-[0.9rem] text-ink">
                      <span aria-hidden className="mt-0.5">{a[f.id] === "yes" ? "☑" : "☐"}</span>
                      {f.label}
                    </p>
                  );
                if (f.type === "choice")
                  return (
                    <p key={f.id} className="text-[0.9rem]">
                      <span className="text-ink">{f.label}</span> {f.options.find((o) => o.value === a[f.id])?.label ?? "—"}
                    </p>
                  );
                if (f.type === "text" || f.type === "textarea")
                  return (
                    <p key={f.id} className="text-[0.9rem]">
                      <span className="text-ink">
                        {f.label}
                        {/[.?!:]$/.test(f.label.trim()) ? "" : ":"}
                      </span>{" "}
                      {a[f.id] || "—"}
                    </p>
                  );
                if (f.type === "signature")
                  return (
                    <div key={f.id} className="border-t border-line pt-5">
                      <p className="text-[0.8rem] tracking-[0.12em] text-ink-soft uppercase">{f.label}</p>
                      {a[f.id]?.startsWith("data:image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a[f.id]} alt="Signature" className="mt-2 h-24 w-auto" />
                      ) : null}
                      <p className="mt-2 text-[0.9rem] text-ink">
                        {copy.signatureText || copy.signerName} · {when(copy.signedAt)}
                      </p>
                    </div>
                  );
                return null;
              })}
          </div>
        </div>
      </div>
    </section>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { Markup } from "@/components/faq/FaqAnswer";
import { OnlineForm } from "@/components/forms/OnlineForm";
import { getDb, isDbConfigured } from "@/lib/db";
import { children, formTemplates, formVersions } from "@/lib/db/schema";
import { effectiveFields } from "@/lib/ops/forms";
import { familyPortalData } from "@/lib/ops/public-booking";
import { fmtDate } from "@/lib/time";
import { getGuardian } from "../../session";

export const metadata: Metadata = { title: "Form", robots: { index: false } };
export const dynamic = "force-dynamic";

/** One form, completed and signed in the Family Portal. */
export default async function FormPage({ params, searchParams }: { params: Promise<{ templateId: string }>; searchParams: Promise<{ child?: string }> }) {
  const { templateId } = await params;
  const sp = await searchParams;
  const g = isDbConfigured() ? await getGuardian() : null;
  if (!g) redirect(`/portal?signin=1&next=${encodeURIComponent(`/portal/forms/${templateId}${sp.child ? `?child=${sp.child}` : ""}`)}`);
  const db = getDb();
  // Only forms this family actually needs (and only their own children).
  const data = await familyPortalData(db, g);
  const item = data.forms.find((f) => f.templateId === templateId && (f.childId ?? "") === (sp.child ?? ""));
  if (!item) notFound();
  const [t] = await db.select().from(formTemplates).where(eq(formTemplates.id, templateId));
  const [v] = t?.currentVersionId ? await db.select().from(formVersions).where(eq(formVersions.id, t.currentVersionId)) : [];
  if (!t || !v) notFound();
  const [child] = sp.child ? await db.select().from(children).where(and(eq(children.id, sp.child), eq(children.familyId, g.familyId))) : [];

  return (
    <div className="pt-28 pb-24 lg:pt-36">
      <div className="shell max-w-3xl">
        <Link href="/portal/home?tab=forms" className="eyebrow text-ink-soft hover:text-ink">
          ← Forms
        </Link>
        <p className="eyebrow mt-8 text-ink-soft">Family Portal · Forms</p>
        <h1 className="display mt-4 text-[clamp(2.2rem,1.7rem+2vw,3.4rem)]">{t.title}</h1>
        {child ? (
          <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-2 text-[0.95rem]">
            <div>
              <dt className="eyebrow text-[0.58rem] text-ink-soft">Child</dt>
              <dd className="mt-1">
                {child.firstName} {child.lastName}
              </dd>
            </div>
            <div>
              <dt className="eyebrow text-[0.58rem] text-ink-soft">Date of birth</dt>
              <dd className="mt-1">{fmtDate(child.birthDate, "MMMM d, yyyy")}</dd>
            </div>
          </dl>
        ) : null}
        {item.state === "complete" ? (
          <p className="mt-6 border-l-2 border-blue/50 pl-4 text-[0.92rem] text-ink-soft">You’ve already completed this form. Submitting again replaces your earlier answers.</p>
        ) : null}
        <div className="mt-10">
          <OnlineForm
            templateId={t.id}
            childId={child?.id ?? null}
            fields={effectiveFields(v, t.requiresSignature)}
            requiresSignature={t.requiresSignature}
            signerName={`${g.firstName} ${g.lastName}`}
            intro={
              v.body.trim() ? (
                <div className="space-y-4 text-[1rem] leading-relaxed text-ink-soft">
                  <Markup text={v.body} />
                </div>
              ) : null
            }
          />
        </div>
        <p className="mt-10 text-[0.78rem] text-ink-soft">Version {v.version}. Your answers, signature, the date and time are saved with an exact copy of this form.</p>
      </div>
    </div>
  );
}

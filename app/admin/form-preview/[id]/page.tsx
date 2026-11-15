import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Markup } from "@/components/faq/FaqAnswer";
import { CheckoutAgreementPreview } from "@/components/forms/CheckoutAgreementPreview";
import { OnlineForm } from "@/components/forms/OnlineForm";
import { SiteHeader } from "@/components/site/SiteHeader";
import { formDetail } from "@/lib/admin/queries/families";
import { requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { effectiveFields } from "@/lib/ops/forms";

export const metadata: Metadata = { title: "Form preview", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const tabCls = (on: boolean) => `rounded-full px-3.5 py-1.5 text-[0.82rem] ${on ? "bg-chalk text-ink" : "text-chalk/80 hover:text-chalk"}`;

/**
 * A form exactly as families see it — the same page, fonts and layout as the Family Portal (or the
 * checkout drawer, for agreements signed while booking) — so staff can proofread spacing and wording.
 * Everything can be tried, but nothing is submitted or saved.
 */
export default async function FormPreviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string; view?: string }> }) {
  await requirePermission("forms.view");
  const { id } = await params;
  const sp = await searchParams;
  const d = await formDetail(getDb(), id);
  if (!d) notFound();
  const t = d.template;
  const current = d.versions.find((v) => v.id === t.currentVersionId);
  const v = d.versions.find((x) => String(x.version) === sp.v) ?? current;
  if (!v) notFound();
  const fields = effectiveFields(v, t.requiresSignature);
  const hasFields = Array.isArray(v.fields) && (v.fields as unknown[]).length > 0;
  const view = sp.view === "checkout" && hasFields ? "checkout" : "portal";
  const href = (o: { view?: string; v?: number }) => {
    const q = new URLSearchParams();
    const vv = o.v ?? v.version;
    if (vv !== current?.version) q.set("v", String(vv));
    if ((o.view ?? view) === "checkout") q.set("view", "checkout");
    const s = q.toString();
    return `/admin/form-preview/${t.id}${s ? `?${s}` : ""}`;
  };

  return (
    <div className="min-h-screen bg-chalk text-ink">
      {/* Staff-only bar: which version, which view. Families never see this. */}
      <div className="fixed inset-x-0 top-0 z-[60] bg-ink text-chalk">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 min-h-10 py-1 text-[0.82rem]">
          <Link href={`/admin/forms/${t.id}${v.id !== current?.id ? `?v=${v.version}` : ""}`} className="text-chalk/80 hover:text-chalk">
            ← Back to admin
          </Link>
          <span className="hidden font-medium md:inline">Preview · exactly as families see it · nothing is saved</span>
          {hasFields ? (
            <span className="flex gap-1 rounded-full bg-chalk/10 p-1">
              <Link href={href({ view: "portal" })} className={tabCls(view === "portal")}>
                Family Portal
              </Link>
              <Link href={href({ view: "checkout" })} className={tabCls(view === "checkout")}>
                At checkout
              </Link>
            </span>
          ) : null}
          {d.versions.length > 1 ? (
            <span className="flex items-center gap-1">
              {d.versions.map((x) => (
                <Link key={x.id} href={href({ v: x.version })} className={`rounded-md px-2 py-0.5 ${x.id === v.id ? "bg-chalk text-ink" : "text-chalk/80 hover:text-chalk"}`}>
                  v{x.version}
                  {x.id === current?.id ? " (current)" : ""}
                </Link>
              ))}
            </span>
          ) : null}
        </div>
      </div>

      {view === "checkout" ? (
        <div className="min-h-screen bg-ink/30 px-0 pt-20 pb-16 sm:px-4">
          <CheckoutAgreementPreview title={t.title} version={v.version} fields={fields} validForMonths={t.validForMonths} perChild={t.perChild} />
        </div>
      ) : (
        <>
          <div className="pointer-events-none">
            <SiteHeader offset />
          </div>
          <main className="pt-36 pb-24 lg:pt-44">
            <div className="shell max-w-3xl">
              <span className="eyebrow text-ink-soft">← Forms</span>
              <p className="eyebrow mt-8 text-ink-soft">Family Portal · Forms</p>
              <h1 className="display mt-4 text-[clamp(2.2rem,1.7rem+2vw,3.4rem)]">{t.title}</h1>
              {t.perChild ? (
                <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-2 text-[0.95rem]">
                  <div>
                    <dt className="eyebrow text-[0.58rem] text-ink-soft">Child</dt>
                    <dd className="mt-1">Sam Sample</dd>
                  </div>
                  <div>
                    <dt className="eyebrow text-[0.58rem] text-ink-soft">Date of birth</dt>
                    <dd className="mt-1">March 4, 2024</dd>
                  </div>
                </dl>
              ) : null}
              <div className="mt-10">
                <OnlineForm
                  preview
                  templateId={t.id}
                  childId={null}
                  fields={fields}
                  requiresSignature={t.requiresSignature}
                  signerName="Sample Parent"
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
          </main>
        </>
      )}
    </div>
  );
}

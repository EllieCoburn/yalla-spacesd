import { notFound } from "next/navigation";
import { PrintButton } from "@/components/admin/roster/PrintButton";
import { SignedDocument } from "@/components/forms/SignedDocument";
import { submissionDetail } from "@/lib/admin/queries/families";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { fmtDate, fmtDateTime } from "@/lib/time";
import { effectiveFields } from "@/lib/ops/forms";
import { bookings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const metadata = { title: "Print signed agreement" };

/**
 * A signed agreement or form for paper records: the full text as signed, with initials, answers and
 * signature, and the signature record (who, when, version, device, content fingerprint). Use the
 * browser's print dialog to print it or save it as a PDF.
 */
export default async function PrintSubmission({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission("forms.view");
  if (!can(staff, "forms.documents")) notFound();
  const { id } = await params;
  const d = await submissionDetail(getDb(), id);
  if (!d) notFound();
  const { s, t, v, f, c } = d;
  const answers = (s.data as { answers?: Record<string, string> } | null)?.answers ?? {};
  const [b] = s.bookingId ? await getDb().select({ reference: bookings.reference }).from(bookings).where(eq(bookings.id, s.bookingId)) : [];
  const record: [string, string][] = [
    ["Family", f.name],
    ...(c ? ([["Child", `${c.preferredName || c.firstName} ${c.lastName}${c.birthDate ? ` · born ${fmtDate(c.birthDate)}` : ""}`]] as [string, string][]) : []),
    ["Signed by", s.signerName ? `${s.signerName}${s.signerRelationship ? ` (${s.signerRelationship})` : ""}` : "—"],
    ["Typed signature", s.signatureText ?? "—"],
    ["Signed", fmtDateTime(s.signedAt ?? s.createdAt)],
    ["Version", `v${v.version}, published ${fmtDateTime(v.publishedAt)}`],
    ...(s.expiresOn ? ([["Valid until", fmtDate(s.expiresOn)]] as [string, string][]) : []),
    ...(b ? ([["Booking", b.reference]] as [string, string][]) : []),
    ["Recorded", d.recordedBy ? `By ${d.recordedBy} (staff, on the family’s behalf)` : "By the family, online"],
    ["Device", s.signerIp || s.signerUserAgent ? `${s.signerIp ?? "—"} · ${s.signerUserAgent?.slice(0, 120) ?? ""}` : "Not captured"],
    ["Content fingerprint (SHA-256)", s.contentHash ?? "—"],
    ["Printed", `${fmtDateTime(new Date())} from Yalla Admin`],
  ];

  return (
    <div className="print-doc mx-auto max-w-3xl">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .print-doc, .print-doc * { visibility: visible !important; }
          .print-doc { position: absolute; inset: 0 auto auto 0; width: 100%; max-width: none; }
          .print-hide { display: none !important; }
          body::before { display: none !important; }
          body, .min-h-screen { background: white !important; }
          .print-doc { font-size: 10.5pt; color: #000; }
          .print-doc .signed-doc, .print-doc .signed-doc * { color: #1f2133 !important; }
          .print-doc > div { border: 0 !important; padding: 0 !important; }
          .signed-doc-box, .signed-doc img, .print-record { break-inside: avoid; }
          .signed-doc h2 { break-after: avoid; }
          @page { margin: 14mm; }
        }
      `}</style>
      <div className="print-hide mb-6 flex items-center justify-between">
        <a href={`/admin/forms/submissions/${s.id}`} className="text-[0.85rem] text-ink-soft hover:text-ink">
          ← Back to the submission
        </a>
        <PrintButton />
      </div>
      <div className="rounded-xl border border-ink/10 bg-white p-8 sm:p-10">
        <p className="text-[0.7rem] tracking-[0.18em] text-ink-soft uppercase">Yalla Childcare &amp; Coworking · Signed record</p>
        <h1 className="mt-2 font-serif text-[1.8rem] leading-tight text-ink">{t.title}</h1>
        <dl className="print-record mt-5 grid grid-cols-[11rem_1fr] gap-x-4 gap-y-1.5 border-y border-ink/10 py-4 text-[0.82rem]">
          {record.map(([k, val]) => (
            <div key={k} className="contents">
              <dt className="text-ink-soft">{k}</dt>
              <dd className="break-all text-ink">{val}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6">
          <SignedDocument fields={effectiveFields(v, t.requiresSignature)} answers={answers} body={s.versionBody ?? v.body} kind={t.kind} signatureText={s.signatureText} signerName={s.signerName} signedAt={s.signedAt ?? s.createdAt} />
        </div>
      </div>
    </div>
  );
}

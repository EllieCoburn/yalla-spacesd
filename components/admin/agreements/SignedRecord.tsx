import { eq } from "drizzle-orm";
import { SignedDocument } from "@/components/forms/SignedDocument";
import type { Executor } from "@/lib/db";
import { bookings } from "@/lib/db/schema";
import { submissionDetail } from "@/lib/admin/queries/families";
import { effectiveFields } from "@/lib/ops/forms";
import { fmtDate, fmtDateTime } from "@/lib/time";

/** Print styles shared by every printed record (each record starts on a new page). */
export const PRINT_STYLES = `
  @media print {
    body * { visibility: hidden !important; }
    .print-doc, .print-doc * { visibility: visible !important; }
    .print-doc { position: absolute; inset: 0 auto auto 0; width: 100%; max-width: none; }
    .print-hide { display: none !important; }
    body::before { display: none !important; }
    body, .min-h-screen { background: white !important; }
    .print-doc { font-size: 10.5pt; color: #000; }
    .print-doc .signed-doc, .print-doc .signed-doc * { color: #1f2133 !important; }
    .print-record-sheet { border: 0 !important; padding: 0 !important; }
    .print-record-sheet + .print-record-sheet { break-before: page; }
    .signed-doc-box, .signed-doc img, .print-record { break-inside: avoid; }
    .signed-doc h2 { break-after: avoid; }
    @page { margin: 14mm; }
  }
`;

/**
 * One signed agreement or form for paper records: the signature record (who, when, how long it's
 * valid, version, device, content fingerprint), then the full text with initials and signature.
 */
export async function SignedRecord({ db, submissionId }: { db: Executor; submissionId: string }) {
  const d = await submissionDetail(db, submissionId);
  if (!d) return null;
  const { s, t, v, f, c } = d;
  const answers = (s.data as { answers?: Record<string, string> } | null)?.answers ?? {};
  const [b] = s.bookingId ? await db.select({ reference: bookings.reference }).from(bookings).where(eq(bookings.id, s.bookingId)) : [];
  const record: [string, string][] = [
    ["Family", f.name],
    ...(c ? ([["Child", `${c.preferredName || c.firstName} ${c.lastName}${c.birthDate ? ` · born ${fmtDate(c.birthDate)}` : ""}`]] as [string, string][]) : []),
    ["Agreement valid", t.frequency === "per_booking" ? `For booking ${b?.reference ?? "—"} only` : s.expiresOn ? `Until ${fmtDate(s.expiresOn, "MMMM d, yyyy")}` : "Doesn’t expire"],
    ["Signed by", s.signerName ? `${s.signerName}${s.signerRelationship ? ` (${s.signerRelationship})` : ""}` : "—"],
    ["Typed signature", s.signatureText ?? "—"],
    ["Signed", fmtDateTime(s.signedAt ?? s.createdAt)],
    ["Version", `v${v.version}, published ${fmtDateTime(v.publishedAt)}`],
    ...(b && t.frequency !== "per_booking" ? ([["Booking", b.reference]] as [string, string][]) : []),
    ["Recorded", d.recordedBy ? `By ${d.recordedBy} (staff, on the family’s behalf)` : "By the family, online"],
    ["Device", s.signerIp || s.signerUserAgent ? `${s.signerIp ?? "—"} · ${s.signerUserAgent?.slice(0, 120) ?? ""}` : "Not captured"],
    ["Content fingerprint (SHA-256)", s.contentHash ?? "—"],
    ["Printed", `${fmtDateTime(new Date())} from Yalla Admin`],
  ];
  return (
    <div className="print-record-sheet rounded-xl border border-ink/10 bg-white p-8 sm:p-10">
      <p className="text-[0.7rem] tracking-[0.18em] text-ink-soft uppercase">Yalla Coworking &amp; Childcare · Signed record</p>
      <h1 className="mt-2 font-serif text-[1.8rem] leading-tight text-ink">{t.title}</h1>
      <dl className="print-record mt-5 grid grid-cols-[11rem_1fr] gap-x-4 gap-y-1.5 border-y border-ink/10 py-4 text-[0.82rem]">
        {record.map(([k, val]) => (
          <div key={k} className="contents">
            <dt className="text-ink-soft">{k}</dt>
            <dd className={`break-all ${k === "Agreement valid" ? "font-semibold text-ink" : "text-ink"}`}>{val}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6">
        <SignedDocument fields={effectiveFields(v, t.requiresSignature)} answers={answers} body={s.versionBody ?? v.body} kind={t.kind} signatureText={s.signatureText} signerName={s.signerName} signedAt={s.signedAt ?? s.createdAt} />
      </div>
    </div>
  );
}

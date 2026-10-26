import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, DL, Notice, PageHeader, Pill } from "@/components/admin/ui";
import { submissionDetail } from "@/lib/admin/queries/families";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { fmtDate, fmtDateTime } from "@/lib/time";

export const metadata = { title: "Submission" };

export default async function SubmissionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ recorded?: string }> }) {
  const staff = await requirePermission("forms.view");
  const { id } = await params;
  const sp = await searchParams;
  const d = await submissionDetail(getDb(), id);
  if (!d) notFound();
  const docs = can(staff, "forms.documents");
  const { s, t, v, f, c } = d;
  const isCurrent = t.currentVersionId === v.id;

  return (
    <>
      <PageHeader
        back={{ href: `/admin/forms/${t.id}`, label: t.title }}
        title={`${t.title} · v${v.version}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/admin/families/${f.id}`} className="text-blue hover:underline">
              {f.name}
            </Link>
            {c ? <span>· {c.preferredName || c.firstName} {c.lastName}</span> : null}
            <Pill tone={s.status === "superseded" ? "muted" : "positive"} icon={s.status === "superseded" ? "arrow" : "check"}>
              {s.status === "signed" ? "Signed" : s.status === "submitted" ? "Submitted" : s.status === "superseded" ? "Superseded by a later submission" : s.status}
            </Pill>
            {!isCurrent ? <Pill tone="warning" icon="alert">Signed against an earlier version</Pill> : null}
          </span>
        }
      />
      {sp.recorded ? (
        <div className="mb-5">
          <Notice tone="positive" title="Recorded">This submission is now on the family’s record.</Notice>
        </div>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card title="Exact text at the time of submission">
          {docs ? (
            <div className="max-h-[36rem] overflow-y-auto rounded-lg border border-ink/8 bg-white p-4 text-[0.88rem] leading-relaxed whitespace-pre-wrap text-ink">{s.versionBody}</div>
          ) : (
            <Notice tone="muted">Opening completed forms requires the “Open completed forms and documents” permission.</Notice>
          )}
          <p className="mt-3 text-[0.75rem] text-ink-soft">
            Content fingerprint (SHA-256): <code className="break-all">{s.contentHash}</code>
            {s.contentHash === v.contentHash ? " — matches the published version." : " — does not match the version record."}
          </p>
        </Card>
        <div className="space-y-6">
          <Card title="Signature record">
            <DL
              cols={1}
              items={[
                { label: "Signer", value: s.signerName ? `${s.signerName}${s.signerRelationship ? ` (${s.signerRelationship})` : ""}` : "No signature (form submission)" },
                { label: "Typed signature", value: docs ? (s.signatureText ? <span className="font-serif text-[1.1rem] italic">{s.signatureText}</span> : "—") : "Restricted" },
                { label: "Signed / submitted", value: fmtDateTime(s.signedAt ?? s.createdAt) },
                { label: "Version", value: `v${v.version}, published ${fmtDateTime(v.publishedAt)}` },
                { label: "Expires", value: s.expiresOn ? fmtDate(s.expiresOn) : "Doesn’t expire" },
                { label: "Recorded by", value: d.recordedBy ? `${d.recordedBy} (staff, on the family’s behalf)` : "The family (Family Portal)" },
                { label: "Device", value: s.signerIp || s.signerUserAgent ? `${s.signerIp ?? "—"} · ${s.signerUserAgent?.slice(0, 80) ?? ""}` : "Not captured (staff-recorded)" },
                ...(s.bookingId ? [{ label: "Booking", value: <Link href={`/admin/bookings/${s.bookingId}`} className="text-blue hover:underline">View booking</Link> }] : []),
              ]}
            />
          </Card>
          {d.document ? (
            <Card title="Attached document">
              <p className="text-[0.86rem] text-ink">{d.document.filename}</p>
              <p className="text-[0.75rem] text-ink-soft">
                {(d.document.size / 1024).toFixed(0)} KB · uploaded {fmtDateTime(d.document.createdAt)}
              </p>
              {docs ? (
                <a href={`/admin/documents/${d.document.id}`} className="mt-3 inline-flex h-9 items-center rounded-lg bg-ink px-3.5 text-[0.84rem] font-medium text-chalk hover:bg-blue">
                  Download
                </a>
              ) : (
                <p className="mt-2 text-[0.8rem] text-ink-soft">You don’t have permission to open documents.</p>
              )}
            </Card>
          ) : null}
          {s.data && docs ? (
            <Card title="Submitted details">
              <pre className="text-[0.78rem] whitespace-pre-wrap text-ink">{JSON.stringify(s.data, null, 2)}</pre>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

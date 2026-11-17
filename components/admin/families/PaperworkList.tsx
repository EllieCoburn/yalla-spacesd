import Link from "next/link";
import { Pill, Status } from "@/components/admin/ui";
import type { PaperworkItem } from "@/lib/ops/forms";
import { fmtDate } from "@/lib/time";
import { validity, VALIDITY_CLASS } from "@/components/admin/agreements/validity";

const enforcementLabel: Record<string, string> = {
  blocks_booking: "Required to book",
  before_attendance: "Required before attending",
  informational: "Informational",
};

/** Paperwork status rows. `record` links to recording a submission on the family's behalf. */
export function PaperworkList({ items, familyId, childNames, canRecord }: { items: PaperworkItem[]; familyId: string; childNames?: Map<string, string>; canRecord?: boolean }) {
  if (!items.length) return <p className="text-[0.85rem] text-ink-soft">No forms are currently required.</p>;
  return (
    <ul className="divide-y divide-ink/6">
      {items.map((i) => (
        <li key={`${i.templateId}:${i.childId ?? "family"}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
          <div className="min-w-0">
            <p className="text-[0.86rem] text-ink">
              {i.title}
              {i.childId && childNames?.get(i.childId) ? <span className="text-ink-soft"> · {childNames.get(i.childId)}</span> : null}
            </p>
            <p className="text-[0.74rem] text-ink-soft">
              {enforcementLabel[i.enforcement] ?? i.enforcement}
              {i.signedAt && i.state !== "missing" ? ` · last completed ${fmtDate(i.signedAt.toISOString().slice(0, 10), "d MMM yyyy")}` : ""}
            </p>
            {i.submissionId && i.state !== "missing" && i.frequency !== "per_booking" ? (
              <p className={`text-[0.76rem] ${VALIDITY_CLASS[validity({ expiresOn: i.expiresOn, frequency: i.frequency, signed: true }).tone]}`}>{validity({ expiresOn: i.expiresOn, frequency: i.frequency, signed: true }).text}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {i.enforcement === "informational" && i.state !== "complete" ? (
              <Pill tone="muted" icon="minus">
                Not provided
              </Pill>
            ) : (
              <Status kind="paperwork" value={i.state} />
            )}
            {i.submissionId ? (
              <>
                <Link href={`/admin/forms/submissions/${i.submissionId}`} className="text-[0.78rem] text-blue hover:underline">
                  View
                </Link>
                <Link href={`/admin/forms/submissions/${i.submissionId}/print`} className="text-[0.78rem] text-blue hover:underline">
                  Print
                </Link>
              </>
            ) : null}
            {canRecord && i.state !== "complete" ? (
              <Link href={`/admin/forms/${i.templateId}?record=1&family=${familyId}${i.childId ? `&child=${i.childId}` : ""}#record`} className="text-[0.78rem] text-blue hover:underline">
                Record
              </Link>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function PaperworkSummary({ items }: { items: PaperworkItem[] }) {
  const open = items.filter((i) => i.state !== "complete" && i.enforcement !== "informational").length;
  return open ? (
    <Pill tone="warning" icon="alert">
      {open} outstanding
    </Pill>
  ) : (
    <Pill tone="positive" icon="check">All complete</Pill>
  );
}

import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { roster } from "@/lib/ops/attendance";
import { fmtDate, fmtTime } from "@/lib/time";
import { OpsError } from "@/lib/audit";
import { PrintButton } from "@/components/admin/roster/PrintButton";

export const metadata = { title: "Print roster" };

export default async function PrintRoster({ params }: { params: Promise<{ sessionId: string }> }) {
  const staff = await requirePermission("roster.view");
  const { sessionId } = await params;
  const r = await roster(getDb(), sessionId, staff.permissions).catch((e) => {
    if (e instanceof OpsError) notFound();
    throw e;
  });
  const care = can(staff, "children.care");
  const expected = r.children.filter((c) => c.expected || c.attendance);
  const time = (d: Date | null | undefined) => (d ? fmtTime(d) : "");
  return (
    <div className="print-roster">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .print-roster, .print-roster * { visibility: visible !important; }
          .print-roster { position: absolute; inset: 0 auto auto 0; width: 100%; }
          .print-hide { display: none !important; }
          body::before { display: none !important; }
          body, .min-h-screen { background: white !important; }
          .print-roster table { font-size: 10.5pt; }
          @page { margin: 12mm; }
        }
      `}</style>
      <div className="print-hide mb-4 flex items-center justify-between">
        <a href={`/admin/roster?session=${sessionId}&date=${r.session.localDate}`} className="text-[0.85rem] text-ink-soft hover:text-ink">
          ← Back to roster
        </a>
        <PrintButton />
      </div>
      <h1 className="font-serif text-[1.6rem] text-ink">{r.session.title ?? r.program.name}</h1>
      <p className="mb-4 text-[0.9rem] text-ink-soft">
        {fmtDate(r.session.localDate, "EEEE d MMMM yyyy")} · {fmtTime(r.session.startsAt)}–{fmtTime(r.session.endsAt)} · {expected.length} expected
      </p>
      <table className="w-full border-collapse text-left text-[0.85rem]">
        <thead>
          <tr className="border-b-2 border-ink text-[0.72rem] tracking-[0.04em] uppercase">
            <th className="py-2 pr-3">Child</th>
            <th className="py-2 pr-3">Age · cohort</th>
            {care ? <th className="py-2 pr-3">Alerts</th> : null}
            {care ? <th className="py-2 pr-3">Authorized for departure</th> : null}
            <th className="py-2 pr-3">In</th>
            <th className="py-2 pr-3">Out</th>
            <th className="py-2">Collected by / notes</th>
          </tr>
        </thead>
        <tbody>
          {expected.map((c) => (
            <tr key={c.childId} className="border-b border-ink/20 align-top">
              <td className="py-2 pr-3 font-medium">
                {c.preferredName ? `${c.preferredName} (${c.name})` : c.name}
                {c.notExpectedReason ? <span className="block text-[0.75rem] font-normal">{c.notExpectedReason}</span> : null}
              </td>
              <td className="py-2 pr-3">
                {c.age}
                {c.cohort ? ` · ${c.cohort}` : ""}
              </td>
              {care ? (
                <td className="py-2 pr-3">
                  {c.care?.allergies ? <strong>Allergy: {c.care.allergies}</strong> : ""}
                  {c.care?.medicalNotes ? <span className="block">Medical: {c.care.medicalNotes}</span> : null}
                </td>
              ) : null}
              {care ? (
                <td className="py-2 pr-3">
                  {c.pickups
                    ?.filter((p) => !p.isRestricted)
                    .map((p) => p.name)
                    .join(", ")}
                  {c.pickups
                    ?.filter((p) => p.isRestricted)
                    .map((p) => (
                      <strong key={p.id} className="block">
                        DO NOT RELEASE: {p.name}
                      </strong>
                    ))}
                </td>
              ) : null}
              <td className="w-16 py-2 pr-3 tabular-nums">{time(c.attendance?.checkedInAt)}</td>
              <td className="w-16 py-2 pr-3 tabular-nums">{time(c.attendance?.checkedOutAt)}</td>
              <td className="py-2">{[c.attendance?.collectedByName, c.attendance?.notes].filter(Boolean).join(" · ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-[0.72rem] text-ink-soft">
        Printed by {staff.name}. Contains children’s information — store securely and shred after use.
      </p>
    </div>
  );
}

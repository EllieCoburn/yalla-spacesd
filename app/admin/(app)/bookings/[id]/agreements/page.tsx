import { notFound } from "next/navigation";
import { PrintButton } from "@/components/admin/roster/PrintButton";
import { PRINT_STYLES, SignedRecord } from "@/components/admin/agreements/SignedRecord";
import { bookingDetail } from "@/lib/admin/queries/bookings";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";

export const metadata = { title: "Print booking agreements" };

/**
 * Every signed agreement and form that covers a booking (each child's, e.g. a Camp Yalla agreement
 * for this purchase or the Flex agreement on file), one after another, each starting on a new page.
 */
export default async function PrintBookingAgreements({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission("forms.view");
  if (!can(staff, "forms.documents") || !can(staff, "bookings.view")) notFound();
  const { id } = await params;
  const db = getDb();
  const d = await bookingDetail(db, id);
  if (!d) notFound();
  const items = [...d.paperwork.values()].flat().filter((p) => p.submissionId && p.state !== "missing");
  const ids = [...new Set(items.map((p) => p.submissionId!))];
  const missing = [...d.paperwork.values()].flat().filter((p) => !p.submissionId || p.state === "missing");
  const records = await Promise.all(ids.map((sid) => SignedRecord({ db, submissionId: sid })));

  return (
    <div className="print-doc mx-auto max-w-3xl space-y-8">
      <style>{PRINT_STYLES}</style>
      <div className="print-hide flex flex-wrap items-center justify-between gap-3">
        <div>
          <a href={`/admin/bookings/${id}`} className="text-[0.85rem] text-ink-soft hover:text-ink">
            ← Back to booking {d.booking.reference}
          </a>
          <p className="mt-1 text-[0.85rem] text-ink-soft">
            {ids.length} signed {ids.length === 1 ? "record" : "records"} for this booking
            {missing.length ? ` · not signed yet: ${[...new Set(missing.map((m) => m.title))].join(", ")}` : ""}
          </p>
        </div>
        {ids.length ? <PrintButton /> : null}
      </div>
      {ids.length ? records : <p className="text-[0.9rem] text-ink-soft">Nothing has been signed for this booking yet.</p>}
    </div>
  );
}

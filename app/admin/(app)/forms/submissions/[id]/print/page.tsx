import { notFound } from "next/navigation";
import { PrintButton } from "@/components/admin/roster/PrintButton";
import { PRINT_STYLES, SignedRecord } from "@/components/admin/agreements/SignedRecord";
import { requireStaff } from "@/lib/auth/session";
import { canOpenSubmission, flexClubOnly } from "@/lib/auth/flex-club";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";

export const metadata = { title: "Print signed agreement" };

/**
 * A signed agreement or form for paper records. Use the browser's print dialog to print it or save it
 * as a PDF.
 */
export default async function PrintSubmission({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const { id } = await params;
  // Club Yalla operations staff may print forms for Flex and Club Yalla families only.
  if (!(await canOpenSubmission(getDb(), staff, id))) notFound();
  if (!can(staff, "forms.documents") && !flexClubOnly(staff)) notFound();
  const record = await SignedRecord({ db: getDb(), submissionId: id });
  if (!record) notFound();
  return (
    <div className="print-doc mx-auto max-w-3xl">
      <style>{PRINT_STYLES}</style>
      <div className="print-hide mb-6 flex items-center justify-between">
        <a href={`/admin/forms/submissions/${id}`} className="text-[0.85rem] text-ink-soft hover:text-ink">
          ← Back to the submission
        </a>
        <PrintButton />
      </div>
      {record}
    </div>
  );
}

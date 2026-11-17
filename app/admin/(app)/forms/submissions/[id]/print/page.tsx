import { notFound } from "next/navigation";
import { PrintButton } from "@/components/admin/roster/PrintButton";
import { PRINT_STYLES, SignedRecord } from "@/components/admin/agreements/SignedRecord";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";

export const metadata = { title: "Print signed agreement" };

/**
 * A signed agreement or form for paper records. Use the browser's print dialog to print it or save it
 * as a PDF.
 */
export default async function PrintSubmission({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission("forms.view");
  if (!can(staff, "forms.documents")) notFound();
  const { id } = await params;
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

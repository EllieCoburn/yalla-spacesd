import { getDb } from "@/lib/db";
import { invoicePdf } from "@/lib/billing/invoice-pdf";
import { getGuardian } from "../../../session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A family's invoice as a PDF (US Letter). Only signed-in guardians who can see billing, for their own family. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await getGuardian();
  if (!g) return new Response("Please sign in to the Family Portal.", { status: 401 });
  if (!g.canViewBilling) return new Response("Your account can’t view billing.", { status: 403 });
  const { id } = await ctx.params;
  const doc = await invoicePdf(getDb(), String(id).slice(0, 60));
  // Someone else's invoice reads as not found, so ids can't be probed.
  if (!doc || doc.familyId !== g.familyId) return new Response("Invoice not found.", { status: 404 });
  return new Response(Buffer.from(doc.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${doc.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

import { getDb } from "@/lib/db";
import { playPassChargePdf } from "@/lib/billing/invoice-pdf";
import { getGuardian } from "../../../../session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A paid Play Pass membership payment as an invoice PDF. Signed-in guardians who can see billing, own family only. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await getGuardian();
  if (!g) return new Response("Please sign in to the Family Portal.", { status: 401 });
  if (!g.canViewBilling) return new Response("Your account can’t view billing.", { status: 403 });
  const { id } = await ctx.params;
  const doc = await playPassChargePdf(getDb(), String(id).slice(0, 60));
  if (!doc || doc.familyId !== g.familyId) return new Response("Invoice not found.", { status: 404 });
  return new Response(Buffer.from(doc.bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${doc.filename}"`, "Cache-Control": "private, no-store" },
  });
}

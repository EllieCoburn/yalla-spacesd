import { getStaff } from "@/lib/auth/session";
import { can, staffReady } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { invoicePdf } from "@/lib/billing/invoice-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Any family's invoice as the same branded PDF families download, for staff who can view billing. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const staff = await getStaff();
  const text = (msg: string, status: number) => new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  if (!staffReady(staff)) return text("Sign in to Admin to download invoices.", 401);
  if (!can(staff, "billing.view")) return text("You don’t have permission to view billing.", 403);
  const { id } = await ctx.params;
  const doc = await invoicePdf(getDb(), String(id).slice(0, 60));
  if (!doc) return text("Invoice not found.", 404);
  // ?view opens it in the browser to print; otherwise it downloads.
  const inline = new URL(req.url).searchParams.has("view");
  return new Response(Buffer.from(doc.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${doc.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

import { openDocument } from "@/lib/admin/queries/families";
import { getStaff } from "@/lib/auth/session";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Streams a private document. There are no public file URLs; access is checked on every request. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await openDocument(getDb(), await getStaff(), id);
  if (res.status !== 200) {
    const msg = res.status === 401 ? "Sign in to view this document." : res.status === 403 ? "You don’t have permission to open documents." : "Document not found.";
    return new Response(msg, { status: res.status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  const { doc } = res;
  const safeName = doc.filename.replace(/[^\w.\- ]+/g, "_");
  return new Response(new Uint8Array(doc.data), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Length": String(doc.size),
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

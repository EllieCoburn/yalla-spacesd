import { getDb } from "@/lib/db";
import { photoForFamily } from "@/lib/ops/day-feed";
import { getGuardian } from "../../session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A photo from a child's day, for that child's family only. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await getGuardian();
  if (!g) return new Response("Sign in required", { status: 401 });
  const { id } = await ctx.params;
  const p = await photoForFamily(getDb(), g.familyId, String(id).slice(0, 60));
  if (!p) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(p.data), { headers: { "Content-Type": p.mimeType, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
}

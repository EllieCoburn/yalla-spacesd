import { getStaff } from "@/lib/auth/session";
import { staffReady } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { photoForStaff } from "@/lib/ops/day-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A day-feed photo, for a team member who can open that child's day right now. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const staff = await getStaff();
  if (!staffReady(staff)) return new Response("Sign in required", { status: 401 });
  const { id } = await ctx.params;
  const p = await photoForStaff(getDb(), staff, String(id).slice(0, 60));
  if (!p) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(p.data), { headers: { "Content-Type": p.mimeType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

import { headers } from "next/headers";
import { getGuardian } from "@/app/(site)/portal/session";
import { getDb, isDbConfigured } from "@/lib/db";
import { saveCart } from "@/lib/ops/carts";
import { allow } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * A copy of a visitor's cart (lib/booking/cart.ts), so staff can see what's in carts (Admin → Carts &
 * checkouts). Only session ids, spots and extras are kept, under a random cart id; a signed-in
 * family's cart is linked to their family. Always answers 204 so the site never waits on it.
 */
export async function POST(req: Request) {
  if (!isDbConfigured()) return new Response(null, { status: 204 });
  const body = (await req.json().catch(() => null)) as { cartId?: unknown; items?: unknown } | null;
  if (!body || typeof body.cartId !== "string") return new Response(null, { status: 204 });
  const db = getDb();
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  if (!(await allow(db, "cartIp", ip))) return new Response(null, { status: 204 });
  const guardian = await getGuardian();
  await saveCart(db, { cartId: body.cartId, items: body.items, familyId: guardian?.familyId ?? null }).catch((e) => console.error("[cart save]", (e as Error).message?.slice(0, 160)));
  return new Response(null, { status: 204 });
}

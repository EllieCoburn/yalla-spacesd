/**
 * Private links for pages that show a booking or invoice without signing in (the page Stripe
 * returns families to, and links in emails). The short booking reference alone is not enough:
 * each link carries a key derived from the reference with the server secret, so it can't be guessed.
 * A signed-in family that owns the booking (or staff) can open the page without the key.
 */
import { createHmac } from "node:crypto";
import { safeEqual } from "@/lib/auth/crypto";

type Kind = "booking" | "offer" | "invoice" | "playpass";

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set to at least 32 characters.");
  return s;
}

export function linkKey(kind: Kind, id: string) {
  return createHmac("sha256", secret()).update(`link:${kind}:${id}`).digest("base64url").slice(0, 32);
}

export function validLinkKey(kind: Kind, id: string, key: string | null | undefined) {
  return typeof key === "string" && key.length === 32 && safeEqual(key, linkKey(kind, id));
}

const q = (params: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  return p.toString();
};

export const bookingStatusPath = (reference: string, extra: Record<string, string | undefined> = {}) =>
  `/book/confirmation/${encodeURIComponent(reference)}?${q({ k: linkKey("booking", reference), ...extra })}`;

export const offerPath = (reference: string, extra: Record<string, string | undefined> = {}) =>
  `/book/offer/${encodeURIComponent(reference)}?${q({ k: linkKey("offer", reference), ...extra })}`;

export const invoiceStatusPath = (invoiceNumber: string, extra: Record<string, string | undefined> = {}) =>
  `/pay/complete?${q({ invoice: invoiceNumber, k: linkKey("invoice", invoiceNumber), ...extra })}`;

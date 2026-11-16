import "server-only";
import { getGuardian } from "@/app/(site)/portal/session";
import { getStaff } from "@/lib/auth/session";
import { staffReady } from "@/lib/auth/staff";
import { validLinkKey } from "@/lib/links";

/**
 * Who may see a booking or invoice status page: anyone holding the private link (it carries a key
 * that can't be guessed from the reference), the signed-in family it belongs to, or staff.
 */
export async function mayViewStatus(kind: "booking" | "offer" | "invoice", id: string, key: string | null | undefined, familyId: string | null) {
  if (validLinkKey(kind, id, key)) return true;
  const g = await getGuardian();
  if (g && familyId && g.familyId === familyId) return true;
  return staffReady(await getStaff());
}

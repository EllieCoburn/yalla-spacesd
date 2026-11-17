import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { getGuardian } from "@/app/(site)/portal/session";
import { getDb, isDbConfigured } from "@/lib/db";
import { children } from "@/lib/db/schema";
import { getPolicy } from "@/lib/ops/settings";
import { walletSummary } from "@/lib/playpass/wallet";

export const dynamic = "force-dynamic";

/**
 * The signed-in family's children, so the program pages can offer them by name. Only for a real
 * signed-in family (never the open portal preview's sample family); everyone else gets an empty list.
 */
export async function GET() {
  const guardian = await getGuardian();
  const list = guardian
    ? await getDb()
        .select({
          id: children.id,
          firstName: children.firstName,
          lastName: children.lastName,
          preferredName: children.preferredName,
          birthDate: children.birthDate,
          allergies: children.allergies,
          medicalNotes: children.medicalNotes,
        })
        .from(children)
        .where(
          and(
            eq(children.familyId, guardian.familyId),
            eq(children.status, "active"),
          ),
        )
        .orderBy(asc(children.birthDate))
    : [];
  // What checkout needs to open right on the program page.
  const wallet = guardian ? await walletSummary(getDb(), guardian.familyId) : null;
  const sibling = isDbConfigured()
    ? { percent: Number(await getPolicy(getDb(), "billing.siblingDiscountPercent")) || 0, withPass: !!(await getPolicy(getDb(), "playpass.siblingDiscountWithWallet")) }
    : { percent: 0, withPass: false };
  return NextResponse.json(
    {
      children: list.map((c) => ({
        id: c.id,
        name: c.preferredName || c.firstName,
        birthDate: c.birthDate,
      })),
      checkout: {
        guardian: guardian ? { firstName: guardian.firstName, lastName: guardian.lastName, email: guardian.email, phone: guardian.phone ?? null } : null,
        savedChildren: list.map((c) => ({ id: c.id, firstName: c.firstName, lastName: c.lastName, preferredName: c.preferredName, birthDate: c.birthDate, ...(guardian?.canViewSensitive ? { allergies: c.allergies, medicalNotes: c.medicalNotes } : {}) })),
        wallet: wallet ? { passCents: wallet.passCents, creditCents: wallet.creditCents } : null,
        sibling,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { getGuardian } from "@/app/(site)/portal/session";
import { getDb } from "@/lib/db";
import { children } from "@/lib/db/schema";

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
          preferredName: children.preferredName,
          birthDate: children.birthDate,
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
  return NextResponse.json(
    {
      children: list.map((c) => ({
        id: c.id,
        name: c.preferredName || c.firstName,
        birthDate: c.birthDate,
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

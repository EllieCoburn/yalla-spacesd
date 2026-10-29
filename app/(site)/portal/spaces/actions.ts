"use server";

import { and, eq, gt, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { OpsError, type Actor } from "@/lib/audit";
import { getDb, isDbConfigured } from "@/lib/db";
import { spaceReservationGroups } from "@/lib/db/schema";
import { dayView, myDay, type DayView } from "@/lib/spaces/availability";
import { cancelSpaceGroup, createReservation, moveSpaceGroup, quoteSpace, startSpaceCheckout, type Quote, type ReserveInput } from "@/lib/spaces/engine";
import { getGuardian, requestContext } from "../session";

type Result<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Accepts only the fields a request may carry, in the shapes the engine expects. */
function clean(input: ReserveInput): ReserveInput {
  if (!input || typeof input.workspaceId !== "string" || !ISO.test(input.date ?? "")) throw new OpsError("invalid", "Choose a workspace and a date.");
  const types = ["complimentary", "half_day", "full_day", "week", "hourly"];
  if (!types.includes(input.bookingType)) throw new OpsError("invalid", "Choose how you’d like to book.");
  return {
    workspaceId: input.workspaceId.slice(0, 64),
    bookingType: input.bookingType,
    date: input.date,
    start: typeof input.start === "string" ? input.start.slice(0, 5) : undefined,
    minutes: typeof input.minutes === "number" ? Math.round(input.minutes) : undefined,
    half: input.half === "morning" || input.half === "afternoon" ? input.half : undefined,
  };
}

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof OpsError) return { ok: false, error: e.message, code: e.code };
    console.error("[spaces action failed]", (e as Error).message?.slice(0, 200));
    return { ok: false, error: "Something went wrong and nothing was booked. Please try again." };
  }
}

async function guardian() {
  const g = await getGuardian();
  if (!g) throw new OpsError("signed_out", "Sign in to the Family Portal to reserve a space.");
  return g;
}

const actorOf = (g: { guardianId: string; firstName: string; lastName: string }): Actor => ({ type: "family", id: g.guardianId, name: `${g.firstName} ${g.lastName}` });

/** Availability for a day, plus the signed-in family's allowance and their own reservations. */
export async function loadDay(date: string): Promise<Result<{ view: DayView; me: Awaited<ReturnType<typeof myDay>> | null }>> {
  return run(async () => {
    if (!ISO.test(date)) throw new OpsError("invalid", "Choose a date.");
    if (!isDbConfigured()) throw new OpsError("unavailable", "Book a Space isn’t connected on this deployment.");
    const db = getDb();
    const g = await getGuardian();
    return { view: await dayView(db, date), me: g ? await myDay(db, g.familyId, date) : null };
  });
}

/** Prices and checks a request. When changing an existing reservation, its own time and minutes don't count against it. */
export async function quote(input: ReserveInput, movingReference?: string): Promise<Result<Quote>> {
  return run(async () => {
    const g = await getGuardian();
    const excludeGroupId = g && movingReference ? (await ownGroup(g.familyId, movingReference)).id : undefined;
    return quoteSpace(getDb(), clean(input), { familyId: g?.familyId ?? null, excludeGroupId });
  });
}

/** Reserves complimentary time immediately, or holds paid time and returns the checkout link. */
export async function reserve(input: ReserveInput): Promise<Result<{ reference: string; url: string | null }>> {
  return run(async () => {
    const g = await guardian();
    if (!g.canBook) throw new OpsError("forbidden", "Your account can’t make reservations. Ask your family’s primary guardian.");
    const db = getDb();
    // A light throttle against runaway clients: plenty for real use.
    const [recent] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(spaceReservationGroups)
      .where(and(eq(spaceReservationGroups.createdByGuardianId, g.guardianId), gt(spaceReservationGroups.createdAt, new Date(Date.now() - 10 * 60_000))));
    if (recent.n >= 20) throw new OpsError("throttled", "That’s a lot of reservations in a few minutes. Please wait a moment and try again.");
    const group = await createReservation(db, actorOf(g), clean(input), { familyId: g.familyId, guardianId: g.guardianId, source: "portal", charge: "pay_now" });
    revalidatePath("/portal/spaces", "layout");
    if (group.status === "confirmed") return { reference: group.reference, url: null };
    const { baseUrl } = await requestContext();
    const checkout = await startSpaceCheckout(db, actorOf(g), group.id, { base: baseUrl });
    return { reference: group.reference, url: checkout.url };
  });
}

async function ownGroup(familyId: string, reference: string) {
  const [grp] = await getDb()
    .select()
    .from(spaceReservationGroups)
    .where(and(eq(spaceReservationGroups.reference, String(reference).slice(0, 20)), eq(spaceReservationGroups.familyId, familyId)));
  if (!grp) throw new OpsError("not_found", "Reservation not found.");
  return grp;
}

export async function cancel(reference: string): Promise<Result<null>> {
  return run(async () => {
    const g = await guardian();
    const grp = await ownGroup(g.familyId, reference);
    await cancelSpaceGroup(getDb(), actorOf(g), grp.id, { familyId: g.familyId, reason: "Cancelled by family" });
    revalidatePath("/portal/spaces", "layout");
    return null;
  });
}

export async function move(reference: string, input: ReserveInput): Promise<Result<null>> {
  return run(async () => {
    const g = await guardian();
    const grp = await ownGroup(g.familyId, reference);
    await moveSpaceGroup(getDb(), actorOf(g), grp.id, clean(input), { familyId: g.familyId });
    revalidatePath("/portal/spaces", "layout");
    return null;
  });
}

/** Resumes checkout for a held reservation (e.g. after a declined card). */
export async function resumeCheckout(reference: string): Promise<Result<{ url: string }>> {
  return run(async () => {
    const g = await guardian();
    const grp = await ownGroup(g.familyId, reference);
    const { baseUrl } = await requestContext();
    const r = await startSpaceCheckout(getDb(), actorOf(g), grp.id, { base: baseUrl });
    return { url: r.url };
  });
}

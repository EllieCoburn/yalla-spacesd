"use server";

import { redirect } from "next/navigation";
import { OpsError } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { startExtrasCheckout } from "@/lib/ops/booking-extras";
import { guardianActor } from "@/lib/family-auth";
import { getGuardian, requestContext } from "../session";

export type ExtrasState = { error?: string } | undefined;

/** Pay for extras on a day already booked; they're added once the payment goes through. */
export async function addExtrasAction(_: ExtrasState, form: FormData): Promise<ExtrasState> {
  const g = await getGuardian();
  if (!g) return { error: "Please sign in again." };
  if (!g.canBook) return { error: "Your account can’t make bookings. Please ask the primary parent." };
  const date = String(form.get("date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Something went wrong. Please try again." };
  const picks = form
    .getAll("pick")
    .map(String)
    .slice(0, 20)
    .map((v) => {
      const [itemId, key] = v.split("|");
      return { itemId: (itemId ?? "").slice(0, 64), key: (key ?? "").slice(0, 20) };
    });
  const { baseUrl } = await requestContext();
  let url: string;
  try {
    ({ url } = await startExtrasCheckout(getDb(), guardianActor(g), { familyId: g.familyId, date, picks, baseUrl }));
  } catch (e) {
    if (e instanceof OpsError) return { error: e.message };
    throw e;
  }
  redirect(url);
}

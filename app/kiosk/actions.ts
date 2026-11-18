"use server";

import { cookies } from "next/headers";
import { getDb, isDbConfigured } from "@/lib/db";
import { OpsError } from "@/lib/audit";
import { sha256 } from "@/lib/auth/crypto";
import { allow } from "@/lib/rate-limit";
import { KIOSK_COOKIE, kioskCheckIn, kioskCheckOut, kioskLookup, kioskSessionValid, type KioskFamily } from "@/lib/ops/checkin";

type Pick = { sessionId: string; childId: string };
type Result<T> = { ok: true; data: T } | { ok: false; error: string; closed?: boolean };

const CLOSED = { ok: false as const, closed: true, error: "This check-in screen is closed. Please ask a member of Team Yalla." };

async function kioskToken() {
  if (!isDbConfigured()) return null;
  const token = (await cookies()).get(KIOSK_COOKIE)?.value;
  return (await kioskSessionValid(getDb(), token)) ? token! : null;
}

const clean = (code: unknown) => String(code ?? "").replace(/\D/g, "").slice(0, 4);
const picksOf = (p: unknown): Pick[] =>
  Array.isArray(p) ? p.filter((x) => x && typeof x.sessionId === "string" && typeof x.childId === "string").slice(0, 12).map((x) => ({ sessionId: x.sessionId.slice(0, 60), childId: x.childId.slice(0, 60) })) : [];

export async function lookupCode(code: string): Promise<Result<KioskFamily>> {
  const token = await kioskToken();
  if (!token) return CLOSED;
  const db = getDb();
  if (!(await allow(db, "kioskCode", sha256(token)))) return { ok: false, error: "Too many tries. Please ask a member of Team Yalla." };
  const fam = await kioskLookup(db, clean(code));
  if (!fam) return { ok: false, error: "That code didn’t match. Please try again." };
  if (!fam.children.length) return { ok: false, error: "We don’t see anyone booked for today with that code. Please ask a member of Team Yalla." };
  return { ok: true, data: fam };
}

export async function checkInChildren(code: string, picks: Pick[]): Promise<Result<string[]>> {
  const token = await kioskToken();
  if (!token) return CLOSED;
  try {
    return { ok: true, data: await kioskCheckIn(getDb(), clean(code), picksOf(picks)) };
  } catch (e) {
    return { ok: false, error: e instanceof OpsError ? e.message : "Something went wrong. Please ask a member of Team Yalla." };
  }
}

export async function checkOutChildren(code: string, picks: Pick[], pickupId: string): Promise<Result<string[]>> {
  const token = await kioskToken();
  if (!token) return CLOSED;
  try {
    return { ok: true, data: await kioskCheckOut(getDb(), clean(code), picksOf(picks), String(pickupId ?? "").slice(0, 80)) };
  } catch (e) {
    return { ok: false, error: e instanceof OpsError ? e.message : "Something went wrong. Please ask a member of Team Yalla." };
  }
}

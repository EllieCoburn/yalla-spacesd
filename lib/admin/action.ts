import "server-only";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { OpsError } from "@/lib/audit";
import type { Permission } from "@/lib/auth/permissions";
import { getStaff } from "@/lib/auth/session";
import { assertCan, staffActor, type StaffContext } from "@/lib/auth/staff";
import { getDb, type DB } from "@/lib/db";
import type { Actor } from "@/lib/audit";

export type ActionState =
  | {
      ok: boolean;
      error?: string;
      message?: string;
      /** Echoed back so the form keeps what was typed when an action fails. */
      values?: Record<string, string>;
      data?: unknown;
      at?: number;
    }
  | undefined;

type Ctx = { staff: StaffContext; actor: Actor; db: DB; form: FormData; str: (k: string) => string; num: (k: string) => number | null; bool: (k: string) => boolean; cents: (k: string) => number | null; all: (k: string) => string[] };

/**
 * Wraps a server action with authentication, a server-side permission check, consistent error
 * handling and form-value preservation. Expected failures (OpsError) show their message; anything
 * else shows a generic message and is logged without personal data.
 */
export function adminAction(perm: Permission | Permission[] | null, fn: (ctx: Ctx) => Promise<string | void | { message?: string; data?: unknown }>) {
  return async (_prev: ActionState, form: FormData): Promise<ActionState> => {
    const values: Record<string, string> = {};
    for (const [k, v] of form.entries()) if (typeof v === "string" && !k.startsWith("$ACTION")) values[k] = v;
    try {
      const staff = await getStaff();
      if (!staff || (staff.mfaEnabled && !staff.mfaVerified)) return { ok: false, error: "Your session has ended. Sign in again — what you entered is still here.", values };
      for (const p of perm == null ? [] : Array.isArray(perm) ? perm : [perm]) assertCan(staff, p);
      const str = (k: string) => String(form.get(k) ?? "").trim();
      const num = (k: string) => (str(k) === "" ? null : Number(str(k)));
      const cents = (k: string) => {
        const v = str(k).replace(/[$,\s]/g, "");
        if (v === "") return null;
        const n = Number(v);
        if (!Number.isFinite(n)) throw new OpsError("invalid", `“${str(k)}” isn’t a valid amount.`);
        return Math.round(n * 100);
      };
      const res = await fn({ staff, actor: staffActor(staff), db: getDb(), form, str, num, bool: (k) => form.get(k) === "on" || form.get(k) === "true", cents, all: (k) => form.getAll(k).map(String) });
      revalidatePath("/admin", "layout");
      if (typeof res === "string") return { ok: true, message: res, at: Date.now() };
      return { ok: true, message: res?.message, data: res?.data, at: Date.now() };
    } catch (e) {
      unstable_rethrow(e);
      if (e instanceof OpsError) return { ok: false, error: e.message, values, data: e.details, at: Date.now() };
      console.error("[admin action failed]", (e as Error).name, (e as Error).message?.slice(0, 200));
      return { ok: false, error: "Something went wrong and nothing was saved. Please try again.", values, at: Date.now() };
    }
  };
}

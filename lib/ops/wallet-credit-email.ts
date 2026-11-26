/**
 * "$X was added to your Yalla Wallet": one email to the family's primary account email for every
 * credit transaction (a staff credit or adjustment, a cancellation or refund returned as credit, a
 * Yalla-cancelled booking taken as credit, Play Pass funds returned).
 *
 * How it stays one email per transaction:
 * - `recordWalletCredit` runs with the credit itself (same transaction), keyed by the transaction. A retried
 *   request has the same key, so nothing new is recorded.
 * - `sendWalletCreditEmails` sends what's recorded once it's saved: right after admin and Family Portal
 *   actions, and in the daily housekeeping run. Each notice is claimed before sending, so two runs at once
 *   can't both send it. A failed delivery leaves the credit as it is; the attempt is logged in Messages and
 *   retried on the next run (up to 5 attempts).
 *
 * The reason is family-facing and shown exactly as written. Monthly Play Pass allocations aren't included:
 * the Play Pass welcome and renewal emails already say what was added.
 */
import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { guardians, messages, walletCreditNotices } from "@/lib/db/schema";
import { notifyFamily } from "@/lib/notify";
import { verbatim } from "@/lib/notify/html";
import { issueCredit, walletSummary } from "@/lib/playpass/wallet";
import { recordWalletCredit } from "@/lib/playpass/credit-notice";
import { audit, OpsError, type Actor } from "@/lib/audit";

export const MAX_ATTEMPTS = 5;
const CLAIM_MS = 10 * 60_000;

const amount = (cents: number) => (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export { recordWalletCredit } from "@/lib/playpass/credit-notice";

/**
 * Staff giving a family Yalla Wallet credit, for any reason (valid 24 months). The reason is required and
 * is emailed to the family exactly as written. A resubmitted form has the same key: no second credit or email.
 */
export async function giveWalletCredit(db: DB, actor: Actor, input: { familyId: string; amountCents: number; reason: string; idempotencyKey: string }) {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new OpsError("invalid", "Enter the credit amount.");
  const reason = input.reason.replace(/\r/g, "").trim();
  if (!reason) throw new OpsError("invalid", "Enter the reason shared with the family. It’s in the email they get.");
  const key = `courtesy:${input.idempotencyKey}`;
  const added = await db.transaction(async (tx) => {
    const a = await issueCredit(tx, { familyId: input.familyId, amountCents: input.amountCents, sourceRef: key, note: reason, createdBy: actor.name });
    // Same transaction: the email is recorded only if the credit is saved.
    if (a) await recordWalletCredit(tx, { familyId: input.familyId, transactionKey: key, amountCents: input.amountCents, reason });
    return a;
  });
  if (added) await audit(db, actor, { action: "billing.courtesy_credit", entityType: "family", entityId: input.familyId, summary: `Courtesy credit of $${(input.amountCents / 100).toFixed(2)}: ${reason}` });
  return added;
}

/** Send recorded wallet-credit emails that haven't gone out yet. Returns how many were sent. */
export async function sendWalletCreditEmails(db: DB, opts: { baseUrl: string; now?: Date; limit?: number } = { baseUrl: "" }) {
  const now = opts.now ?? new Date();
  // Claim a batch: unsent, not being sent by someone else right now, attempts left.
  const claimed = await db
    .update(walletCreditNotices)
    .set({ claimedAt: now, attempts: sql`${walletCreditNotices.attempts} + 1` })
    .where(
      inArray(
        walletCreditNotices.id,
        db
          .select({ id: walletCreditNotices.id })
          .from(walletCreditNotices)
          .where(
            and(
              isNull(walletCreditNotices.sentAt),
              lt(walletCreditNotices.attempts, MAX_ATTEMPTS),
              or(isNull(walletCreditNotices.claimedAt), lt(walletCreditNotices.claimedAt, new Date(now.getTime() - CLAIM_MS))),
            ),
          )
          .orderBy(asc(walletCreditNotices.createdAt))
          .limit(opts.limit ?? 25),
      ),
    )
    .returning();
  let sent = 0;
  for (const n of claimed) {
    try {
      const [primary] = await db
        .select()
        .from(guardians)
        .where(eq(guardians.familyId, n.familyId))
        .orderBy(sql`${guardians.isPrimary} desc`, asc(guardians.createdAt))
        .limit(1);
      if (!primary) throw new Error("No guardian on file");
      const balance = (await walletSummary(db, n.familyId)).availableCents;
      const [messageId] = await notifyFamily(db, {
        key: "wallet_credit",
        familyId: n.familyId,
        guardianIds: [primary.id],
        vars: {
          parent_first_name: primary.firstName,
          credit_amount: amount(n.amountCents),
          credit_reason: verbatim(n.reason),
          wallet_balance: amount(balance),
          link: `${opts.baseUrl}/portal/wallet`,
        },
        related: { type: "wallet_credit", id: n.id },
      });
      if (!messageId) throw new Error("No recipient for this family");
      const [m] = await db.select({ status: messages.status, error: messages.error }).from(messages).where(eq(messages.id, messageId));
      if (m?.status === "failed") {
        // Logged in Messages as failed; the credit stays. Try again on the next run.
        await db.update(walletCreditNotices).set({ messageId, lastError: (m.error ?? "Delivery failed").slice(0, 300), claimedAt: null }).where(eq(walletCreditNotices.id, n.id));
        continue;
      }
      await db.update(walletCreditNotices).set({ sentAt: new Date(), messageId, lastError: null }).where(eq(walletCreditNotices.id, n.id));
      sent++;
    } catch (e) {
      await db
        .update(walletCreditNotices)
        .set({ lastError: (e as Error).message?.slice(0, 300) ?? "Failed", claimedAt: null })
        .where(eq(walletCreditNotices.id, n.id));
      console.error("[wallet credit email failed]", (e as Error).message?.slice(0, 160));
    }
  }
  return sent;
}

/**
 * Wallet credits for a family that never had an email (e.g. added before this email existed), by ledger
 * entry id. A credit counts as emailed if a notice exists for that entry, or one for the same amount was
 * recorded within a few minutes of it.
 */
export async function creditsWithoutEmail(db: DB, familyId: string, entries: { id: string; amountCents: number; kind: string; createdAt: Date }[]) {
  const credits = entries.filter((e) => e.amountCents > 0 && (e.kind === "credit" || e.kind === "adjustment" || e.kind === "booking_refund"));
  if (!credits.length) return new Set<string>();
  const notices = await db.select().from(walletCreditNotices).where(eq(walletCreditNotices.familyId, familyId));
  const near = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) < 10 * 60_000;
  return new Set(
    credits
      .filter((e) => !notices.some((n) => n.transactionKey === `entry:${e.id}` || (n.amountCents === e.amountCents && near(n.createdAt, e.createdAt))))
      .map((e) => e.id),
  );
}

/** Staff sending the "added to your Yalla Wallet" email for a credit that didn't get one. Once per credit. */
export async function emailForCredit(db: DB, input: { familyId: string; entryId: string; reason: string }) {
  const { walletEntries } = await import("@/lib/db/schema");
  const [e] = await db.select().from(walletEntries).where(eq(walletEntries.id, input.entryId));
  if (!e || e.familyId !== input.familyId || e.amountCents <= 0) throw new OpsError("not_found", "That credit isn’t on this family’s wallet.");
  const reason = input.reason.replace(/\r/g, "").trim();
  if (!reason) throw new OpsError("invalid", "Enter the reason shared with the family. It’s in the email they get.");
  const row = await recordWalletCredit(db, { familyId: input.familyId, transactionKey: `entry:${e.id}`, amountCents: e.amountCents, reason });
  if (!row) throw new OpsError("invalid", "An email for this credit was already sent.");
  return row;
}

/** Best-effort send after an action that may have added credit; never fails the action. */
export async function flushWalletCreditEmails(db: DB, baseUrl: string) {
  try {
    const [pending] = await db.select({ id: walletCreditNotices.id }).from(walletCreditNotices).where(and(isNull(walletCreditNotices.sentAt), lt(walletCreditNotices.attempts, MAX_ATTEMPTS))).limit(1);
    if (pending) await sendWalletCreditEmails(db, { baseUrl });
  } catch (e) {
    console.error("[wallet credit email flush failed]", (e as Error).message?.slice(0, 160));
  }
}

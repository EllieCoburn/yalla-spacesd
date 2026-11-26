/**
 * Records a wallet credit for its "added to your Yalla Wallet" email (sent by lib/ops/wallet-credit-email.ts).
 * Call it with the same executor (transaction) that saved the credit. Keyed by the credit transaction, so
 * calling it again for a retried request records nothing new.
 */
import type { Executor } from "@/lib/db";
import { walletCreditNotices } from "@/lib/db/schema";

export async function recordWalletCredit(db: Executor, input: { familyId: string; transactionKey: string; amountCents: number; reason: string }) {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) return null;
  const reason = input.reason.trim() || "A credit from Team Yalla.";
  const [row] = await db
    .insert(walletCreditNotices)
    .values({ familyId: input.familyId, transactionKey: input.transactionKey, amountCents: input.amountCents, reason })
    .onConflictDoNothing({ target: walletCreditNotices.transactionKey })
    .returning();
  return row ?? null;
}

import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { ActionForm, TextField } from "@/components/admin/forms";
import { decryptSecret, otpauthUrl } from "@/lib/auth/crypto";
import { requireStaff } from "@/lib/auth/session";
import { beginMfaSetup } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { staffUsers } from "@/lib/db/schema";
import { finishMfa } from "../../../(app)/account/actions";
import { signOut } from "../../actions";

export const metadata: Metadata = { title: "Set up two-step verification" };
export const dynamic = "force-dynamic";

/**
 * Two-step verification is required for every staff account. Until it's set up, this is the only
 * admin page a signed-in staff member can reach.
 */
export default async function SetupMfaPage() {
  const staff = await requireStaff({ mfaEnrollment: true });
  if (staff.mfaEnabled) redirect(staff.mfaVerified ? "/admin" : "/admin/login/verify");
  const db = getDb();
  const [u] = await db.select().from(staffUsers).where(eq(staffUsers.id, staff.id));
  const secret = u.mfaPendingSecretEnc ? decryptSecret(u.mfaPendingSecretEnc) : await beginMfaSetup(db, staff.id);
  const qr = await QRCode.toString(otpauthUrl(secret, u.email), { type: "svg", margin: 1, width: 180 });

  return (
    <>
      <h1 className="mt-8 font-serif text-[2rem] text-ink lg:mt-0">Set up two-step verification</h1>
      <p className="mt-2 mb-6 text-[0.9rem] text-ink-soft">
        Yalla’s admin holds children’s and families’ information, so every staff account uses a code from an authenticator app (1Password, Google Authenticator, Authy…) as well as a password.
      </p>
      <div className="space-y-5">
        <div className="flex flex-col items-start gap-4">
          <div className="rounded-lg border border-ink/10 bg-white p-2" dangerouslySetInnerHTML={{ __html: qr }} aria-label="QR code for your authenticator app" />
          <div className="text-[0.85rem] text-ink-soft">
            <p>1. Scan this code with your authenticator app, or enter this key:</p>
            <code className="mt-2 block rounded bg-ink/5 px-2 py-1.5 text-[0.8rem] tracking-wider break-all text-ink">{secret.match(/.{1,4}/g)?.join(" ")}</code>
          </div>
        </div>
        <p className="text-[0.85rem] text-ink-soft">2. Enter the 6-digit code the app shows.</p>
        <ActionForm action={finishMfa} submit={{ label: "Turn on and continue" }}>
          <input type="hidden" name="then" value="admin" />
          <TextField name="code" label="6-digit code" required autoComplete="one-time-code" />
        </ActionForm>
        <form action={signOut}>
          <button className="text-[0.82rem] text-ink-soft underline underline-offset-4 hover:text-ink">Sign out</button>
        </form>
      </div>
    </>
  );
}

import { and, desc, eq, gt, isNull } from "drizzle-orm";
import QRCode from "qrcode";
import { ActionForm, TextField } from "@/components/admin/forms";
import { Card, DL, PageHeader, Pill } from "@/components/admin/ui";
import { decryptSecret, otpauthUrl } from "@/lib/auth/crypto";
import { requireStaff } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { staffSessions, staffUsers } from "@/lib/db/schema";
import { fmtDateTime } from "@/lib/time";
import { changePassword, endSession, finishMfa, startMfa } from "./actions";

export const metadata = { title: "Account & security" };

export default async function AccountPage() {
  const staff = await requireStaff();
  const db = getDb();
  const [u] = await db.select().from(staffUsers).where(eq(staffUsers.id, staff.id));
  const sessions = await db
    .select()
    .from(staffSessions)
    .where(and(eq(staffSessions.staffId, staff.id), isNull(staffSessions.revokedAt), gt(staffSessions.expiresAt, new Date())))
    .orderBy(desc(staffSessions.lastSeenAt));
  const pendingSecret = !u.mfaEnabled && u.mfaSecretEnc ? decryptSecret(u.mfaSecretEnc) : null;
  const qr = pendingSecret ? await QRCode.toString(otpauthUrl(pendingSecret, u.email), { type: "svg", margin: 1, width: 180 }) : null;

  return (
    <>
      <PageHeader title="Account & security" subtitle={`${staff.name} · ${staff.roleName}`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Two-step verification">
          {u.mfaEnabled ? (
            <div className="space-y-3">
              <Pill tone="positive" icon="check">On</Pill>
              <p className="text-[0.88rem] text-ink-soft">You’ll be asked for a code from your authenticator app when you sign in.</p>
            </div>
          ) : pendingSecret ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="shrink-0 rounded-lg border border-ink/10 bg-white p-2" dangerouslySetInnerHTML={{ __html: qr! }} aria-label="QR code for your authenticator app" />
                <div className="text-[0.85rem] text-ink-soft">
                  <p>Scan with an authenticator app (1Password, Google Authenticator, Authy…), or enter this key:</p>
                  <code className="mt-2 block rounded bg-ink/5 px-2 py-1.5 text-[0.8rem] tracking-wider break-all text-ink">{pendingSecret.match(/.{1,4}/g)?.join(" ")}</code>
                </div>
              </div>
              <ActionForm action={finishMfa} submit={{ label: "Turn on" }}>
                <TextField name="code" label="6-digit code" required autoComplete="one-time-code" />
              </ActionForm>
            </div>
          ) : (
            <div className="space-y-3">
              <Pill tone={staff.roleKey === "owner" ? "warning" : "muted"} icon={staff.roleKey === "owner" ? "alert" : "minus"}>
                Off
              </Pill>
              <p className="text-[0.88rem] text-ink-soft">Protect your account with a code from an authenticator app.{staff.roleKey === "owner" ? " Required for owners on the live site." : ""}</p>
              <ActionForm action={startMfa} submit={{ label: "Set up two-step verification" }}>
                <span />
              </ActionForm>
            </div>
          )}
        </Card>

        <Card title="Change password">
          <ActionForm action={changePassword} submit={{ label: "Change password" }} resetOnSuccess>
            <TextField name="current" label="Current password" type="password" autoComplete="current-password" required />
            <TextField name="password" label="New password" type="password" autoComplete="new-password" required hint="At least 12 characters." />
            <TextField name="confirm" label="Confirm new password" type="password" autoComplete="new-password" required />
          </ActionForm>
        </Card>

        <Card title="Signed-in devices" className="lg:col-span-2" padded={false}>
          <ul className="divide-y divide-ink/6">
            {sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p className="text-[0.86rem] text-ink">
                    {s.userAgent?.replace(/\(.*?\)/, "").slice(0, 60) ?? "Unknown device"} {s.id === staff.sessionId ? <Pill tone="info" icon="dot">This device</Pill> : null}
                  </p>
                  <DL cols={3} items={[{ label: "Last active", value: fmtDateTime(s.lastSeenAt) }, { label: "Signed in", value: fmtDateTime(s.createdAt) }, { label: "IP", value: s.ip ?? "—" }]} />
                </div>
                {s.id !== staff.sessionId ? (
                  <ActionForm action={endSession} submit={{ label: "Sign out", variant: "secondary" }}>
                    <input type="hidden" name="sessionId" value={s.id} />
                  </ActionForm>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

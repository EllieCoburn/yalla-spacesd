import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Checkbox, SelectField, TextArea, TextField } from "@/components/admin/forms";
import { btn, Card, DL, Money, Notice, PageHeader, Status } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { adminGroup } from "@/lib/spaces/admin";
import { BOOKING_TYPE_LABEL, CATEGORY_LABEL, getSpaceConfig, type BookingType, type Category } from "@/lib/spaces/config";
import { describeWhen } from "@/lib/spaces/engine";
import { fmtDateTime } from "@/lib/time";
import { asc } from "drizzle-orm";
import { workspaces } from "@/lib/db/schema";
import { cancelReservationAction, moveReservationAction, noteAction } from "../actions";

export const metadata = { title: "Space reservation" };

export default async function SpaceReservation({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission("spaces.view");
  const { id } = await params;
  const db = getDb();
  const d = await adminGroup(db, id);
  if (!d) notFound();
  const { group: g, workspace: w, family, rows } = d;
  const active = rows.filter((r) => r.status === "confirmed" || r.status === "held");
  const shown = active.length ? active : rows.filter((r) => r.status !== "moved");
  const canManage = can(staff, "spaces.manage");
  const cfg = await getSpaceConfig(db);
  const all = await db.select().from(workspaces).orderBy(asc(workspaces.displayOrder));
  const first = shown[0];
  const live = g.status === "confirmed" || g.status === "held" || g.status === "pending_payment";
  const movable = canManage && g.status === "confirmed" && g.bookingType !== "week";

  return (
    <>
      <PageHeader
        back={{ href: "/admin/spaces", label: "Space reservations" }}
        title={
          <>
            {w.name} · {g.reference}
          </>
        }
        subtitle={`${CATEGORY_LABEL[w.category as Category]} · ${BOOKING_TYPE_LABEL[g.bookingType as BookingType]} · ${describeWhen(shown)}`}
        actions={<Status kind="booking" value={g.status} />}
      />
      {g.status === "needs_attention" ? (
        <div className="mb-6">
          <Notice tone="critical" title="Payment arrived after the time was released">
            The family paid after their hold ended, and someone else has since reserved the time. Rebook them by creating a reservation with “No charge”, or refund the payment from the invoice below.
          </Notice>
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Details">
            <DL
              items={[
                {
                  label: "Family",
                  value: can(staff, "families.view") ? (
                    <Link className={btn.link} href={`/admin/families/${family.id}`}>
                      {family.name}
                    </Link>
                  ) : (
                    family.name
                  ),
                },
                { label: "Booked by", value: d.bookedBy ? `${d.bookedBy.firstName} ${d.bookedBy.lastName}` : (g.createdByStaff ? `${g.createdByStaff} (staff)` : "—") },
                { label: "Space", value: `${w.name} · ${CATEGORY_LABEL[w.category as Category]}` },
                { label: "Booking", value: BOOKING_TYPE_LABEL[g.bookingType as BookingType] },
                { label: "Complimentary minutes", value: g.complimentaryMinutes || "—" },
                { label: "Total", value: g.totalCents ? <Money cents={g.totalCents} /> : "No charge" },
                { label: "Payment", value: d.paymentStatus },
                {
                  label: "Invoice",
                  value: d.invoice ? (
                    can(staff, "billing.view") ? (
                      <Link className={btn.link} href={`/admin/billing/invoices/${d.invoice.id}`}>
                        {d.invoice.number}
                      </Link>
                    ) : (
                      d.invoice.number
                    )
                  ) : (
                    "—"
                  ),
                },
                { label: "Created", value: `${fmtDateTime(g.createdAt)} · ${g.source === "admin" ? "by staff" : "in the Family Portal"}` },
                { label: "Hold expires", value: g.holdExpiresAt ? fmtDateTime(g.holdExpiresAt) : "—" },
                ...(g.cancelledAt ? [{ label: "Cancelled", value: `${fmtDateTime(g.cancelledAt)} by ${g.cancelledBy} · ${g.cancellationReason ?? ""}`, full: true }] : []),
              ]}
            />
          </Card>
          <Card title={shown.length > 1 ? `Days (${shown.length})` : "Time"}>
            <ul className="divide-y divide-ink/8 text-[0.88rem]">
              {shown.map((r) => (
                <li key={r.id} className="flex justify-between gap-4 py-2">
                  <span>{describeWhen([r])}</span>
                  <Status kind="item" value={r.status} />
                </li>
              ))}
            </ul>
            {rows.some((r) => r.status === "moved") ? <p className="mt-3 text-[0.78rem] text-ink-soft">Earlier times this reservation was moved from are kept in the audit trail.</p> : null}
          </Card>
        </div>
        <div className="space-y-6">
          {canManage ? (
            <Card title="Staff note">
              <ActionForm action={noteAction} submit={{ label: "Save note" }}>
                <input type="hidden" name="groupId" value={g.id} />
                <TextArea name="note" label="Note" rows={3} defaultValue={g.staffNote} hint="Never shown to families." />
              </ActionForm>
            </Card>
          ) : null}
          {movable && first ? (
            <Card title="Move">
              <ActionForm action={moveReservationAction} submit={{ label: "Move reservation", pending: "Moving…" }}>
                <input type="hidden" name="groupId" value={g.id} />
                <input type="hidden" name="bookingType" value={g.bookingType} />
                <SelectField name="workspaceId" label="Workspace" defaultValue={w.id} options={all.filter((x) => x.active).map((x) => ({ value: x.id, label: x.name }))} />
                <TextField name="date" label="Date" type="date" defaultValue={first.localDate} required />
                {g.bookingType === "complimentary" || g.bookingType === "hourly" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <TextField name="start" label="Start" type="time" defaultValue={new Intl.DateTimeFormat("en-GB", { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit" }).format(first.startsAt)} />
                    <TextField name="minutes" label="Minutes" type="number" defaultValue={Math.round((first.endsAt.getTime() - first.startsAt.getTime()) / 60000)} />
                  </div>
                ) : null}
                {g.bookingType === "half_day" ? (
                  <SelectField
                    name="half"
                    label="Half"
                    options={[...(cfg.halfDay.morning ? [{ value: "morning", label: "Morning" }] : []), ...(cfg.halfDay.afternoon ? [{ value: "afternoon", label: "Afternoon" }] : [])]}
                  />
                ) : null}
                {can(staff, "spaces.configure") ? <Checkbox name="override" label="Override booking rules" hint="Never double-books." /> : null}
              </ActionForm>
            </Card>
          ) : null}
          {canManage && live ? (
            <Card title="Cancel">
              <ActionForm
                action={cancelReservationAction}
                submit={{ label: "Cancel reservation", variant: "danger" }}
                confirm={{ title: "Cancel this reservation?", body: g.totalCents ? "The space is released. Nothing is refunded automatically — refund or credit from the invoice if appropriate." : "The space is released and any complimentary minutes return to the family’s day.", confirmLabel: "Yes, cancel", danger: true }}
              >
                <input type="hidden" name="groupId" value={g.id} />
                <TextField name="reason" label="Reason" required hint="Shown to the family." />
              </ActionForm>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

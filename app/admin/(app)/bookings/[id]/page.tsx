import Link from "next/link";
import { notFound } from "next/navigation";
import { MovePanel } from "@/components/admin/bookings/MovePanel";
import { PaymentPill, StatusLabel } from "@/components/admin/bookings/pills";
import { ActionForm, Checkbox, Disclosure, SelectField, TextArea, TextField } from "@/components/admin/forms";
import { Card, DL, Money, Notice, PageHeader, Pill, Status } from "@/components/admin/ui";
import { bookingDetail, moveTargets } from "@/lib/admin/queries/bookings";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { attendanceRecords } from "@/lib/db/schema";
import { previewCancel } from "@/lib/ops/bookings";
import { usd } from "@/lib/ops/billing";
import { PAPERWORK_LABEL } from "@/lib/ops/forms";
import { ageLabel, fmtDate, fmtDateTime, fmtTime, todayLA } from "@/lib/time";
import { and, eq, inArray } from "drizzle-orm";
import {
  absenceAction,
  addChildAction,
  cancelAction,
  confirmNowAction,
  decideAction,
  moveAction,
  noteAction,
  paymentLinkAction,
  previewMoveAction,
  resendAction,
  undoAbsenceAction,
} from "../actions";

export const metadata = { title: "Booking" };

const EVENT_LABEL: Record<string, string> = {
  created: "Booking created",
  checkout_started: "Checkout started",
  confirmed: "Confirmed",
  needs_attention: "Flagged for attention",
  approved: "Request approved",
  cancelled: "Booking cancelled",
  items_cancelled: "Items cancelled",
  moved: "Item moved",
  child_added: "Child added",
  note: "Note",
  confirmation_resent: "Confirmation resent",
};

const DONE: Record<string, string> = {
  moved: "Moved. The booking history was updated, and any price difference was invoiced separately.",
  cancelled: "Cancelled and the spots released. No refund was issued — use Billing if a refund or credit applies.",
  child_added: "Child added. Any charge for the extra place was added as a new invoice.",
};

export default async function BookingDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; done?: string }> }) {
  const staff = await requirePermission("bookings.view");
  const { id } = await params;
  const { created, done } = await searchParams;
  const db = getDb();
  const d = await bookingDetail(db, id);
  if (!d) notFound();
  const { booking: b, family, items } = d;
  const manage = can(staff, "bookings.manage");
  const billing = can(staff, "billing.view");
  const care = can(staff, "children.care");
  const forms = can(staff, "forms.view");
  const contacts = can(staff, "families.view");
  const active = items.filter((i) => i.item.status === "held" || i.item.status === "confirmed");
  const shown = items.filter((i) => i.item.status !== "moved");
  const cancelPreview = active.length ? await previewCancel(db, id) : null;
  const att = items.length
    ? await db
        .select()
        .from(attendanceRecords)
        .where(
          and(
            inArray(
              attendanceRecords.sessionId,
              items.map((i) => i.session.id),
            ),
            inArray(
              attendanceRecords.childId,
              items.map((i) => i.item.childId ?? "").filter(Boolean),
            ),
          ),
        )
    : [];
  const attFor = (sessionId: string, childId: string | null) => att.find((a) => a.sessionId === sessionId && a.childId === childId);
  const childIds = [...new Set(items.map((i) => i.item.childId).filter(Boolean) as string[])];
  const bookedKids = d.familyChildren.filter((c) => childIds.includes(c.id));
  const today = todayLA();

  // Targets for moving each confirmed item (same program, upcoming).
  const targetsByItem = new Map<string, { id: string; label: string; remaining: number }[]>();
  if (manage)
    for (const i of active.filter((x) => x.item.status === "confirmed" && x.session.endsAt > new Date())) {
      const t = await moveTargets(db, i.program.id, i.session.id, today);
      targetsByItem.set(
        i.item.id,
        t.map((s) => ({ id: s.id, label: `${fmtDate(s.localDate, "EEE d MMM")} · ${fmtTime(s.startsAt)}${s.cohortName ? ` · ${s.cohortName}` : ""}`, remaining: s.remaining })),
      );
    }
  // Sessions this booking covers, for adding a child.
  const bookingSessions = [...new Map(active.map((i) => [i.session.id, i])).values()].filter((i) => i.session.endsAt > new Date());
  const addableKids = d.familyChildren.filter((c) => !active.some((i) => i.item.childId === c.id));
  const hasHeld = active.some((i) => i.item.status === "held");

  return (
    <>
      <PageHeader
        back={{ href: "/admin/bookings", label: "Bookings" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {b.reference}
            <Status kind="booking" value={b.status} />
          </span>
        }
        subtitle={
          <>
            <Link href={`/admin/families/${family.id}`} className="text-ink hover:text-blue">
              {family.name}
            </Link>{" "}
            · Booked {fmtDateTime(b.createdAt)} {b.source === "admin" ? `by ${d.staffNames.get(b.createdByStaffId ?? "") ?? "staff"}` : b.source === "waitlist" ? "from a waitlist offer" : "online"}
          </>
        }
        actions={
          manage && b.status === "confirmed" ? (
            <ActionForm action={resendAction} submit={{ label: "Resend confirmation", variant: "secondary", pending: "Sending…" }} className="flex items-center gap-2">
              <input type="hidden" name="bookingId" value={b.id} />
            </ActionForm>
          ) : null
        }
      />

      {created ? (
        <div className="mb-5">
          <Notice tone="positive" title="Booking created">
            {b.status === "pending_payment" ? "Spots are held while the family pays. The payment link was captured in Messages (test mode)." : "Saved and confirmed."}
          </Notice>
        </div>
      ) : null}

      {done && DONE[done] ? (
        <div className="mb-5">
          <Notice tone="positive">{DONE[done]}</Notice>
        </div>
      ) : null}

      {b.status === "needs_attention" ? (
        <div className="mb-5">
          <Notice tone="critical" title="This booking needs attention">
            The family paid after their checkout hold expired, and the spot had already been taken. Nothing has been overbooked. Choose one: move the child to another session below, refund the payment from{" "}
            {billing && d.payment.invoices[0] ? (
              <Link className="underline" href={`/admin/billing/invoices/${d.payment.invoices[0].id}`}>
                the invoice
              </Link>
            ) : (
              "Billing"
            )}
            , or — if staffing allows — confirm with a recorded capacity override from the session page.
          </Notice>
          {manage ? (
            <div className="mt-3">
              <ActionForm action={confirmNowAction} submit={{ label: "Try confirming again", variant: "secondary" }}>
                <input type="hidden" name="bookingId" value={b.id} />
              </ActionForm>
            </div>
          ) : null}
        </div>
      ) : null}

      {b.status === "requested" && manage ? (
        <Card title="Awaiting your approval" className="mb-5">
          <p className="mb-3 text-[0.85rem] text-ink-soft">The spots are held until you decide. Approving gives the family time to pay; declining cancels the request and releases the spots.</p>
          <ActionForm action={decideAction} submit={{ label: "Record decision" }} className="space-y-3">
            <input type="hidden" name="bookingId" value={b.id} />
            <SelectField
              name="decision"
              label="Decision"
              options={[
                { value: "approve", label: "Approve" },
                { value: "decline", label: "Decline" },
              ]}
            />
            <TextField name="note" label="Note (optional, shared in the decline email)" />
          </ActionForm>
        </Card>
      ) : null}

      {(b.status === "held" || b.status === "pending_payment") && manage ? (
        <Card title="Spots are on hold" className="mb-5">
          <p className="mb-3 text-[0.85rem] text-ink-soft">
            Held until {b.holdExpiresAt ? fmtDateTime(b.holdExpiresAt) : "—"}. After that, the spots are released automatically. Payment status changes only when the payment provider confirms it.
          </p>
          <div className="flex flex-wrap gap-3">
            <ActionForm action={paymentLinkAction} submit={{ label: "Send payment link", variant: "secondary" }}>
              <input type="hidden" name="bookingId" value={b.id} />
            </ActionForm>
            <ActionForm action={confirmNowAction} submit={{ label: "Confirm now, bill later" }} confirm={{ title: "Confirm without waiting for payment?", body: "An invoice will be left open for the amount due.", confirmLabel: "Confirm booking" }}>
              <input type="hidden" name="bookingId" value={b.id} />
              <input type="hidden" name="invoice" value="on" />
              <input type="hidden" name="notify" value="on" />
            </ActionForm>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.65fr_1fr]">
        <div className="space-y-6">
          <Card title="Care booked" padded={false}>
            <ul className="divide-y divide-ink/8">
              {shown.map((i) => {
                const a = attFor(i.session.id, i.item.childId);
                const child = i.child;
                const past = i.session.endsAt < new Date();
                return (
                  <li key={i.item.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[0.95rem] font-medium text-ink">
                          {child ? (
                            <Link href={`/admin/children/${child.id}`} className="hover:text-blue">
                              {child.preferredName || child.firstName} {child.lastName}
                            </Link>
                          ) : (
                            "Family booking"
                          )}
                          {child ? <span className="ml-2 text-[0.8rem] font-normal text-ink-soft">{ageLabel(child.birthDate, i.session.localDate)} on {fmtDate(i.session.localDate, "d MMM")}</span> : null}
                        </p>
                        <p className="mt-0.5 text-[0.85rem] text-ink">
                          {i.program.name} ·{" "}
                          <Link href={`/admin/sessions/${i.session.id}`} className="hover:text-blue">
                            {fmtDate(i.session.localDate, "EEEE d MMMM")}, {fmtTime(i.session.startsAt)}–{fmtTime(i.session.endsAt)}
                          </Link>
                        </p>
                        <p className="text-[0.78rem] text-ink-soft">
                          {i.location?.name ?? "Location not set"}
                          {i.cohort ? ` · ${i.cohort.name}` : ""}
                          {i.item.adults ? ` · ${i.item.adults} adult(s)` : ""}
                          {i.item.spots !== 1 ? ` · ${i.item.spots} spot(s)` : ""}
                        </p>
                        {(i.program.arrivalInstructions ?? i.location?.arrivalInstructions) && i.item.status !== "cancelled" ? (
                          <p className="mt-1 text-[0.78rem] text-ink-soft">
                            <span className="font-medium text-ink">Arrival:</span> {i.program.arrivalInstructions ?? i.location?.arrivalInstructions}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-4">
                        <div>
                          <StatusLabel>Booking</StatusLabel>
                          <Status kind="item" value={i.item.status} />
                        </div>
                        {i.item.status === "confirmed" ? (
                          <div>
                            <StatusLabel>Attendance</StatusLabel>
                            <Status kind="attendance" value={a?.status ?? i.item.attendance} />
                          </div>
                        ) : null}
                        {billing ? (
                          <div>
                            <StatusLabel>Price</StatusLabel>
                            <Money cents={i.item.priceCents} />
                          </div>
                        ) : null}
                      </div>
                    </div>
                    {a?.checkedInAt || a?.checkedOutAt ? (
                      <p className="mt-2 text-[0.78rem] text-ink-soft">
                        {a.checkedInAt ? `In ${fmtTime(a.checkedInAt)} (${a.checkedInBy})` : ""}
                        {a.checkedOutAt ? ` · Out ${fmtTime(a.checkedOutAt)}, collected by ${a.collectedByName}` : ""}
                      </p>
                    ) : null}
                    {manage && i.item.status === "confirmed" ? (
                      <div className="mt-3 grid gap-2">
                        {!past && targetsByItem.get(i.item.id)?.length ? (
                          <Disclosure label="Move to another session">
                            <MovePanel itemId={i.item.id} targets={targetsByItem.get(i.item.id)!} preview={previewMoveAction} move={moveAction} showMoney={billing} />
                          </Disclosure>
                        ) : null}
                        {child ? (
                          <Disclosure label={a?.status === "absent" || i.item.attendance === "absent" ? "Absence recorded" : "Record an absence"}>
                            {a?.status === "absent" || i.item.attendance === "absent" ? (
                              <ActionForm action={undoAbsenceAction} submit={{ label: "Reset to expected", variant: "secondary" }}>
                                <input type="hidden" name="sessionId" value={i.session.id} />
                                <input type="hidden" name="childId" value={child.id} />
                              </ActionForm>
                            ) : (
                              <ActionForm action={absenceAction} submit={{ label: "Record absence", variant: "secondary" }}>
                                <p className="text-[0.8rem] text-ink-soft">Records attendance only. The booking, its payment and any refund are unaffected.</p>
                                <input type="hidden" name="sessionId" value={i.session.id} />
                                <input type="hidden" name="childId" value={child.id} />
                                <TextField name="note" label="Note (optional)" />
                              </ActionForm>
                            )}
                          </Disclosure>
                        ) : null}
                        {active.length > 1 ? (
                          <Disclosure label={child ? `Remove ${child.preferredName || child.firstName} from this session` : "Cancel this item"}>
                            <ActionForm
                              action={cancelAction}
                              submit={{ label: "Cancel this item", variant: "danger" }}
                              confirm={{ title: "Cancel this item?", body: "The spot is released. No refund is issued automatically.", confirmLabel: "Yes, cancel item", danger: true }}
                            >
                              <input type="hidden" name="bookingId" value={b.id} />
                              <input type="hidden" name="itemIds" value={i.item.id} />
                              <TextField name="reason" label="Reason" required />
                              <Checkbox name="notify" label="Email the family" defaultChecked />
                            </ActionForm>
                          </Disclosure>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Card>

          {care ? (
            <Card title="Care information & pickup">
              {bookedKids.length === 0 ? <p className="text-[0.85rem] text-ink-soft">No children on this booking.</p> : null}
              <div className="space-y-5">
                {bookedKids.map((c) => {
                  const pickups = d.pickups.filter((p) => !p.childId || p.childId === c.id);
                  return (
                    <div key={c.id}>
                      <p className="text-[0.9rem] font-medium text-ink">{c.preferredName || c.firstName}</p>
                      <div className="mt-2">
                        <DL
                          items={[
                            { label: "Allergies", value: c.allergies ? <span className="font-medium text-[#8a2333]">⚠ {c.allergies}</span> : "None recorded" },
                            { label: "Medical notes", value: c.medicalNotes },
                            { label: "Care notes (from family)", value: c.careNotes, full: true },
                          ]}
                        />
                      </div>
                      <p className="mt-1 text-[0.72rem] text-ink-soft">Family-provided information last updated {c.infoUpdatedAt ? `${fmtDateTime(c.infoUpdatedAt)} by ${c.infoUpdatedBy}` : "— not recorded"}</p>
                      <p className="mt-3 text-[0.72rem] font-medium tracking-[0.04em] text-ink-soft uppercase">Who may collect</p>
                      <ul className="mt-1 space-y-1 text-[0.85rem]">
                        {d.guardians.map((g) => (
                          <li key={g.id}>
                            ✓ {g.firstName} {g.lastName} <span className="text-ink-soft">· {g.relationship ?? "Guardian"}</span>
                          </li>
                        ))}
                        {pickups.map((p) =>
                          p.isRestricted ? (
                            <li key={p.id} className="rounded-md bg-[#f6e3e5] px-2 py-1 font-medium text-[#8a2333]">
                              ✕ NOT permitted: {p.name}
                              {p.restrictionNote ? <span className="block text-[0.78rem] font-normal">{p.restrictionNote}</span> : null}
                            </li>
                          ) : (
                            <li key={p.id}>
                              ✓ {p.name} <span className="text-ink-soft">· {p.relationship ?? "Authorized"}{p.phone ? ` · ${p.phone}` : ""}</span>
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : null}

          <Card title="Notes & history" padded={false}>
            {manage ? (
              <div className="border-b border-ink/8 p-5">
                <ActionForm action={noteAction} submit={{ label: "Add note", variant: "secondary" }} resetOnSuccess>
                  <input type="hidden" name="bookingId" value={b.id} />
                  <TextArea name="body" label="Internal note" rows={2} placeholder="Visible to staff only" />
                </ActionForm>
              </div>
            ) : null}
            <ol className="divide-y divide-ink/6">
              {d.events.map((e) => {
                const detail = (e.detail ?? {}) as Record<string, unknown>;
                return (
                  <li key={e.id} className="px-5 py-3">
                    <p className="text-[0.86rem] text-ink">
                      <span className="font-medium">{EVENT_LABEL[e.type] ?? e.type}</span>
                      {e.type === "note" ? <span className="mt-0.5 block whitespace-pre-wrap">{String(detail.body ?? "")}</span> : null}
                      {detail.reason && e.type !== "note" ? <span className="text-ink-soft"> — {String(detail.reason)}</span> : null}
                      {e.type === "moved" && billing && typeof detail.difference === "number" && detail.difference !== 0 ? <span className="text-ink-soft"> · price difference {usd(detail.difference)}</span> : null}
                    </p>
                    <p className="text-[0.72rem] text-ink-soft">
                      {e.actorName ?? "System"} · {fmtDateTime(e.at)}
                    </p>
                  </li>
                );
              })}
              {d.overrides.map((o) => (
                <li key={o.id} className="px-5 py-3">
                  <p className="text-[0.86rem] text-ink">
                    <span className="font-medium">Capacity override +{o.extraSpots}</span> — {o.reason}
                  </p>
                  <p className="text-[0.72rem] text-ink-soft">
                    {d.staffNames.get(o.staffId) ?? "Staff"} · {fmtDateTime(o.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Payment" actions={billing && d.payment.invoices.length ? <Link href={`/admin/billing/invoices/${d.payment.invoices[0].id}`} className="text-blue">Invoice →</Link> : null}>
            <div className="mb-3">
              <PaymentPill state={billing ? d.payment.state : d.payment.state === "partial" ? "unpaid" : d.payment.state} />
            </div>
            {billing ? (
              d.payment.invoices.length ? (
                <ul className="space-y-3">
                  {d.payment.invoices.map((inv) => (
                    <li key={inv.id} className="rounded-lg border border-ink/10 p-3 text-[0.84rem]">
                      <div className="flex items-center justify-between">
                        <Link href={`/admin/billing/invoices/${inv.id}`} className="font-medium text-ink hover:text-blue">
                          {inv.number}
                        </Link>
                        <Status kind="invoice" value={inv.status} />
                      </div>
                      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[0.8rem]">
                        <dt className="text-ink-soft">Total</dt>
                        <dd className="text-right">
                          <Money cents={inv.totals.total} />
                        </dd>
                        <dt className="text-ink-soft">Paid</dt>
                        <dd className="text-right">
                          <Money cents={inv.totals.paid} />
                        </dd>
                        {inv.totals.creditApplied ? (
                          <>
                            <dt className="text-ink-soft">Credit applied</dt>
                            <dd className="text-right">
                              <Money cents={inv.totals.creditApplied} />
                            </dd>
                          </>
                        ) : null}
                        {inv.totals.refunded ? (
                          <>
                            <dt className="text-ink-soft">Refunded</dt>
                            <dd className="text-right">
                              <Money cents={inv.totals.refunded} />
                            </dd>
                          </>
                        ) : null}
                        <dt className="font-medium">Balance</dt>
                        <dd className="text-right font-medium">
                          <Money cents={inv.totals.balance} />
                        </dd>
                      </dl>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[0.85rem] text-ink-soft">No invoice is attached to this booking.</p>
              )
            ) : (
              <p className="text-[0.78rem] text-ink-soft">Amounts and invoices are visible to staff with billing access.</p>
            )}
          </Card>

          {forms ? (
            <Card title="Paperwork" actions={<Link href={`/admin/families/${family.id}#paperwork`} className="text-blue">Family forms →</Link>}>
              {[...d.paperwork.values()].flat().length === 0 ? (
                <p className="text-[0.85rem] text-ink-soft">No forms are required for this booking.</p>
              ) : (
                <ul className="space-y-2">
                  {[...d.paperwork.entries()].flatMap(([key, list]) =>
                    list.map((p) => {
                      const who = key === "family" ? "Family" : (d.familyChildren.find((c) => c.id === key)?.preferredName ?? d.familyChildren.find((c) => c.id === key)?.firstName);
                      return (
                        <li key={`${key}-${p.templateId}`} className="flex flex-wrap items-center justify-between gap-2 text-[0.84rem]">
                          <span>
                            <span className="text-ink">{p.title}</span>
                            <span className="block text-[0.74rem] text-ink-soft">
                              {who} · {p.enforcement === "blocks_booking" ? "Required to book" : p.enforcement === "before_attendance" ? "Required before attending" : "Informational"}
                            </span>
                          </span>
                          <Status kind="paperwork" value={p.state} suffix={p.state === "complete" && p.signedAt ? fmtDate(p.signedAt.toISOString().slice(0, 10), "d MMM yy") : undefined} />
                        </li>
                      );
                    }),
                  )}
                </ul>
              )}
              <p className="sr-only">{Object.values(PAPERWORK_LABEL).join(", ")}</p>
            </Card>
          ) : null}

          {contacts ? (
            <Card title="Family & contacts" actions={<Link href={`/admin/families/${family.id}`} className="text-blue">Profile →</Link>}>
              <ul className="space-y-3 text-[0.85rem]">
                {d.guardians.map((g) => (
                  <li key={g.id}>
                    <p className="font-medium text-ink">
                      {g.firstName} {g.lastName} {g.isPrimary ? <Pill tone="info">Primary</Pill> : null}
                    </p>
                    <p className="text-ink-soft">{g.relationship ?? "Guardian"}</p>
                    <p>
                      <a className="text-blue hover:underline" href={`mailto:${g.email}`}>
                        {g.email}
                      </a>
                      {g.phone ? (
                        <>
                          {" · "}
                          <a className="text-blue hover:underline" href={`tel:${g.phone}`}>
                            {g.phone}
                          </a>
                        </>
                      ) : null}
                    </p>
                  </li>
                ))}
                {d.emergency.length ? (
                  <li className="border-t border-ink/8 pt-3">
                    <p className="text-[0.72rem] font-medium tracking-[0.04em] text-ink-soft uppercase">Emergency contacts</p>
                    {d.emergency.map((e) => (
                      <p key={e.id}>
                        {e.name} <span className="text-ink-soft">· {e.relationship}</span> ·{" "}
                        <a className="text-blue hover:underline" href={`tel:${e.phone}`}>
                          {e.phone}
                        </a>
                      </p>
                    ))}
                  </li>
                ) : null}
              </ul>
            </Card>
          ) : null}

          {manage && b.status === "confirmed" && addableKids.length && bookingSessions.length ? (
            <Card title="Add a child">
              <ActionForm action={addChildAction} submit={{ label: "Add child" }}>
                <input type="hidden" name="bookingId" value={b.id} />
                <SelectField name="childId" label="Child" options={addableKids.map((c) => ({ value: c.id, label: `${c.preferredName || c.firstName} ${c.lastName}` }))} />
                <SelectField
                  name="sessionId"
                  label="Session"
                  options={bookingSessions.map((i) => ({ value: i.session.id, label: `${i.program.name} · ${fmtDate(i.session.localDate, "EEE d MMM")} ${fmtTime(i.session.startsAt)}` }))}
                />
                <p className="text-[0.75rem] text-ink-soft">Same capacity rules as any booking. If there’s no room, nothing is changed.</p>
                {can(staff, "capacity.override") ? (
                  <>
                    <Checkbox name="override" label="Authorize a capacity override if needed" hint="Never exceeds hard capacity. Recorded with your name." />
                    <TextField name="overrideReason" label="Override reason" />
                  </>
                ) : null}
              </ActionForm>
            </Card>
          ) : null}

          {manage && active.length && cancelPreview ? (
            <Card title="Cancel booking">
              <p className="mb-3 text-[0.85rem] text-ink-soft">{billing ? cancelPreview.note : "Cancelling releases the spots. Refunds are handled separately by billing staff."}</p>
              <ActionForm
                action={cancelAction}
                submit={{ label: "Cancel booking", variant: "danger" }}
                confirm={{
                  title: `Cancel all ${active.length} item(s) on ${b.reference}?`,
                  body: billing && cancelPreview.paidCents > 0 ? `${usd(cancelPreview.paidCents)} has been paid. No refund will be issued by this action.` : "The spots will be released immediately.",
                  confirmLabel: "Yes, cancel booking",
                  danger: true,
                }}
              >
                <input type="hidden" name="bookingId" value={b.id} />
                <TextField name="reason" label="Reason" required />
                <Checkbox name="notify" label="Email the family a cancellation notice" defaultChecked />
              </ActionForm>
              {hasHeld ? <p className="mt-2 text-[0.75rem] text-ink-soft">Held spots are also released when the hold expires.</p> : null}
            </Card>
          ) : null}

          {d.audit.length && can(staff, "audit.view") ? (
            <Card title="Audit entries" padded={false}>
              <ul className="divide-y divide-ink/6">
                {d.audit.slice(0, 10).map((a) => (
                  <li key={a.id} className="px-5 py-2.5">
                    <p className="text-[0.8rem] text-ink">{a.summary}</p>
                    <p className="text-[0.7rem] text-ink-soft">
                      {a.actorName} · {fmtDateTime(a.at)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

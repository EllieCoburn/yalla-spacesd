import Link from "next/link";
import { notFound } from "next/navigation";
import { EmergencyList, PickupList } from "@/components/admin/families/ContactForms";
import { GuardianFields } from "@/components/admin/families/GuardianForm";
import { NotesPanel } from "@/components/admin/families/Notes";
import { PaperworkList, PaperworkSummary } from "@/components/admin/families/PaperworkList";
import { ActionForm, Checkbox, Disclosure, SelectField, TextArea, TextField } from "@/components/admin/forms";
import { Card, DL, Empty, LinkButton, Money, Notice, PageHeader, Pill, Status } from "@/components/admin/ui";
import { familyProfile } from "@/lib/admin/queries/families";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { WEEKDAY } from "@/lib/ops/memberships";
import { ageLabel, fmtDate, fmtDateTime, todayLA } from "@/lib/time";
import { addChildAction, addGuardianAction, archiveFamilyAction, restoreFamilyAction, updateFamilyAction, updateGuardianAction } from "../actions";

export default async function FamilyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const staff = await requirePermission("families.view");
  const { id } = await params;
  const sp = await searchParams;
  const d = await familyProfile(getDb(), staff, id);
  if (!d) notFound();
  const today = todayLA();
  const manage = can(staff, "families.manage");
  const kids = d.children.map((c) => ({ id: c.id, name: c.preferredName || c.firstName }));
  const kidNames = new Map(d.children.map((c) => [c.id, c.preferredName || c.firstName]));
  const prefs = d.family.communicationPrefs as { email?: boolean; sms?: boolean };
  const allPaperwork = d.paperwork ? [...d.paperwork.values()].flat() : [];
  const primary = d.guardians.find((g) => g.isPrimary) ?? d.guardians[0];

  return (
    <>
      <PageHeader
        back={{ href: "/admin/families", label: "Families" }}
        title={d.family.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {d.family.status === "archived" ? <Pill tone="muted" icon="x">Archived</Pill> : null}
            {d.family.isSample ? <Pill tone="muted">Sample data</Pill> : null}
            {d.memberships.some((m) => ["active", "upcoming", "paused"].includes(m.m.status)) ? <Pill tone="info" icon="check">Club Yalla</Pill> : null}
            <span>
              Family since {fmtDate(d.family.createdAt.toISOString().slice(0, 10), "MMMM yyyy")}
              {primary ? ` · ${primary.email}` : ""}
            </span>
          </span>
        }
        actions={
          <>
            {can(staff, "bookings.manage") ? <LinkButton href={`/admin/bookings/new?family=${d.family.id}`} variant="primary">New booking</LinkButton> : null}
            {can(staff, "memberships.manage") ? <LinkButton href={`/admin/memberships/new?family=${d.family.id}`}>Start membership</LinkButton> : null}
          </>
        }
      />
      {sp.created ? (
        <div className="mb-5">
          <Notice tone="positive" title="Family created">Add their children, other guardians and emergency contacts below.</Notice>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          {/* Guardians */}
          <Card title={`Guardians (${d.guardians.length})`}>
            <ul className="divide-y divide-ink/6">
              {d.guardians.map((g) => (
                <li key={g.id} className="py-3 first:pt-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[0.92rem] font-medium text-ink">
                        {g.firstName} {g.lastName} {g.isPrimary ? <Pill tone="neutral" className="ml-1">Primary</Pill> : null}
                      </p>
                      <p className="text-[0.8rem] text-ink-soft">
                        {g.relationship ?? "Guardian"} · <a href={`mailto:${g.email}`} className="hover:underline">{g.email}</a>
                        {g.phone ? (
                          <>
                            {" "}
                            · <a href={`tel:${g.phone}`} className="hover:underline">{g.phone}</a>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Pill tone={g.portalAccess ? "positive" : "muted"} icon={g.portalAccess ? "check" : "x"}>Portal</Pill>
                      <Pill tone={g.canBook ? "positive" : "muted"} icon={g.canBook ? "check" : "x"}>Booking</Pill>
                      <Pill tone={g.canViewBilling ? "positive" : "muted"} icon={g.canViewBilling ? "check" : "x"}>Billing</Pill>
                      <Pill tone={g.canViewSensitive ? "positive" : "muted"} icon={g.canViewSensitive ? "check" : "x"}>Care info</Pill>
                    </div>
                  </div>
                  {manage ? (
                    <div className="mt-2">
                      <Disclosure label={`Edit ${g.firstName}`}>
                        <ActionForm action={updateGuardianAction} submit={{ label: "Save guardian" }}>
                          <input type="hidden" name="guardianId" value={g.id} />
                          <GuardianFields g={g} />
                        </ActionForm>
                      </Disclosure>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            {manage ? (
              <div className="mt-3">
                <Disclosure label="Add another guardian">
                  <p className="mb-3 text-[0.8rem] text-ink-soft">Each adult has their own login. Billing and care-information access are off unless you turn them on.</p>
                  <ActionForm action={addGuardianAction} submit={{ label: "Add guardian" }} resetOnSuccess>
                    <input type="hidden" name="familyId" value={d.family.id} />
                    <GuardianFields />
                  </ActionForm>
                </Disclosure>
              </div>
            ) : null}
          </Card>

          {/* Children */}
          <Card title={`Children (${d.children.length})`}>
            {d.children.length === 0 ? <Empty title="No children yet">Add a child to start booking care.</Empty> : null}
            <ul className="divide-y divide-ink/6">
              {d.children.map((c) => (
                <li key={c.id}>
                  <Link href={`/admin/children/${c.id}`} className="-mx-2 flex flex-wrap items-center justify-between gap-3 rounded-lg px-2 py-3 hover:bg-mist/30">
                    <span>
                      <span className="block text-[0.92rem] font-medium text-ink">
                        {c.preferredName ? `${c.preferredName} (${c.firstName})` : c.firstName} {c.lastName}
                      </span>
                      <span className="text-[0.8rem] text-ink-soft">
                        {ageLabel(c.birthDate, today)} · born {fmtDate(c.birthDate, "d MMM yyyy")}
                        {c.cohortName ? ` · ${c.cohortName}` : " · no cohort"}
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {c.allergies ? <Pill tone="critical" icon="alert">Allergy: {c.allergies}</Pill> : null}
                      {d.paperwork ? <PaperworkSummary items={d.paperwork.get(c.id) ?? []} /> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {manage ? (
              <div className="mt-3">
                <Disclosure label="Add a child">
                  <ActionForm action={addChildAction} submit={{ label: "Add child" }} resetOnSuccess>
                    <input type="hidden" name="familyId" value={d.family.id} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <TextField name="firstName" label="First name" required />
                      <TextField name="lastName" label="Last name" defaultValue={primary?.lastName} />
                      <TextField name="preferredName" label="Preferred name" />
                      <TextField name="birthDate" label="Date of birth" type="date" required />
                      <SelectField name="cohortId" label="Cohort" options={[{ value: "", label: "Not assigned" }, ...d.cohorts.map((c) => ({ value: c.id, label: c.name }))]} />
                    </div>
                    {can(staff, "children.care") ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <TextArea name="allergies" label="Allergies (as provided by the family)" rows={2} />
                        <TextArea name="careNotes" label="Care notes (as provided by the family)" rows={2} />
                      </div>
                    ) : null}
                    <p className="text-[0.75rem] text-ink-soft">If this child is already on the record (same first name and birth date), no duplicate is created.</p>
                  </ActionForm>
                </Disclosure>
              </div>
            ) : null}
          </Card>

          {/* Memberships */}
          {can(staff, "memberships.view") ? (
            <Card title="Club Yalla memberships" actions={can(staff, "memberships.manage") ? <Link href={`/admin/memberships/new?family=${d.family.id}`} className="text-blue">Start membership</Link> : null} padded={false}>
              {d.memberships.length === 0 ? (
                <p className="px-5 py-4 text-[0.85rem] text-ink-soft">No memberships.</p>
              ) : (
                <ul className="divide-y divide-ink/6">
                  {d.memberships.map(({ m, c, co }) => (
                    <li key={m.id}>
                      <Link href={`/admin/memberships/${m.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-mist/30">
                        <span>
                          <span className="block text-[0.88rem] text-ink">
                            {c.preferredName || c.firstName} · {co.name}
                          </span>
                          <span className="text-[0.78rem] text-ink-soft">
                            {m.weekdays.map((w) => WEEKDAY[w]).join(", ")} · {m.dayLength === "half" ? "Half day" : "Full day"}
                            {m.earlyBird ? " + Early Bird" : ""} · from {fmtDate(m.startsOn, "d MMM yyyy")}
                            {m.endsOn ? ` to ${fmtDate(m.endsOn, "d MMM yyyy")}` : ""}
                          </span>
                        </span>
                        <Status kind="membership" value={m.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}

          {/* Bookings */}
          {can(staff, "bookings.view") ? (
            <Card title="Bookings" actions={<Link href={`/admin/bookings?family=${d.family.id}`} className="text-blue">All bookings →</Link>} padded={false}>
              <div className="px-5 pt-3 text-[0.72rem] font-medium tracking-[0.04em] text-ink-soft uppercase">Upcoming</div>
              {d.upcoming.length === 0 ? <p className="px-5 py-3 text-[0.85rem] text-ink-soft">Nothing upcoming.</p> : null}
              <ul className="divide-y divide-ink/6">
                {d.upcoming.map((b) => (
                  <li key={b.booking.id}>
                    <Link href={`/admin/bookings/${b.booking.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-mist/30">
                      <span>
                        <span className="block text-[0.88rem] text-ink">{b.programs.join(", ")}</span>
                        <span className="text-[0.78rem] text-ink-soft">
                          {b.booking.reference} · {fmtDate(b.firstDate, "EEE d MMM")}
                          {b.lastDate !== b.firstDate ? `–${fmtDate(b.lastDate, "EEE d MMM")}` : ""} · {b.children.join(", ") || "Family booking"}
                        </span>
                      </span>
                      <Status kind="booking" value={b.booking.status} />
                    </Link>
                  </li>
                ))}
              </ul>
              {d.past.length ? (
                <>
                  <div className="border-t border-ink/8 px-5 pt-3 text-[0.72rem] font-medium tracking-[0.04em] text-ink-soft uppercase">Past & cancelled</div>
                  <ul className="divide-y divide-ink/6">
                    {d.past.map((b) => (
                      <li key={b.booking.id}>
                        <Link href={`/admin/bookings/${b.booking.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 hover:bg-mist/30">
                          <span className="text-[0.84rem] text-ink">
                            {b.programs.join(", ")} <span className="text-ink-soft">· {b.booking.reference} · {fmtDate(b.firstDate, "d MMM yyyy")}</span>
                          </span>
                          <Status kind="booking" value={b.booking.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </Card>
          ) : null}

          <Card title="Internal notes">
            <NotesPanel familyId={d.family.id} notes={d.notes} canWrite={manage} canCare={can(staff, "children.care")} />
          </Card>
        </div>

        <div className="space-y-6">
          {d.paperwork ? (
            <Card id="paperwork" title="Forms & waivers" actions={<PaperworkSummary items={allPaperwork} />}>
              <PaperworkList items={allPaperwork} familyId={d.family.id} childNames={kidNames} canRecord={can(staff, "forms.manage")} />
            </Card>
          ) : null}

          {d.ledger ? (
            <Card title="Billing" actions={<Link href={`/admin/billing/invoices?family=${d.family.id}`} className="text-blue">Invoices →</Link>}>
              <DL
                cols={2}
                items={[
                  { label: "Outstanding balance", value: <span className={d.ledger.outstanding ? "font-medium text-[#8a5212]" : ""}><Money cents={d.ledger.outstanding} /></span> },
                  { label: "Account credit", value: <Money cents={d.ledger.credit} /> },
                ]}
              />
              {d.ledger.invoices.length ? (
                <ul className="mt-4 divide-y divide-ink/6 border-t border-ink/8">
                  {d.ledger.invoices.slice(0, 10).map((inv) => (
                    <li key={inv.id}>
                      <Link href={`/admin/billing/invoices/${inv.id}`} className="-mx-2 flex items-center justify-between gap-3 rounded px-2 py-2.5 hover:bg-mist/30">
                        <span className="min-w-0">
                          <span className="block truncate text-[0.84rem] text-ink">{inv.description ?? inv.number}</span>
                          <span className="text-[0.74rem] text-ink-soft">
                            {inv.number} · {fmtDate(inv.issuedAt.toISOString().slice(0, 10), "d MMM yyyy")} · total <Money cents={inv.totals.total} />
                            {inv.totals.refunded ? (
                              <>
                                {" "}
                                · refunded <Money cents={inv.totals.refunded} />
                              </>
                            ) : null}
                          </span>
                        </span>
                        <span className="flex flex-col items-end gap-1">
                          <Status kind="invoice" value={inv.status} />
                          {inv.status === "open" && inv.totals.balance > 0 ? (
                            <span className="text-[0.74rem] text-[#8a5212]">
                              <Money cents={inv.totals.balance} /> due
                            </span>
                          ) : null}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-[0.85rem] text-ink-soft">No invoices yet.</p>
              )}
            </Card>
          ) : null}

          <Card title="Emergency contacts">
            <EmergencyList familyId={d.family.id} contacts={d.emergency} kids={kids} canEdit={manage} />
          </Card>

          {d.pickups ? (
            <Card title="Departure contacts & restrictions">
              <PickupList familyId={d.family.id} pickups={d.pickups} kids={kids} canEdit={manage} />
            </Card>
          ) : null}

          <Card title="Communication preferences">
            {manage ? (
              <ActionForm action={updateFamilyAction} submit={{ label: "Save", variant: "secondary" }}>
                <input type="hidden" name="familyId" value={d.family.id} />
                <TextField name="name" label="Family name" defaultValue={d.family.name} required />
                <Checkbox name="prefEmail" label="Service messages by email" hint="Confirmations, reminders, receipts and form requests." defaultChecked={prefs.email !== false} />
                <Checkbox name="prefSms" label="Service messages by text" hint="Text delivery isn’t connected yet — this records the preference." defaultChecked={!!prefs.sms} />
                <Checkbox name="marketingOptIn" label="Marketing emails" hint="Separate from service messages. Never assumed." defaultChecked={d.family.marketingOptIn} />
              </ActionForm>
            ) : (
              <DL
                items={[
                  { label: "Email", value: prefs.email !== false ? "Yes" : "No" },
                  { label: "Text", value: prefs.sms ? "Yes" : "No" },
                  { label: "Marketing", value: d.family.marketingOptIn ? "Opted in" : "Not opted in" },
                ]}
              />
            )}
            <p className="mt-3 text-[0.74rem] text-ink-soft">Last updated {fmtDateTime(d.family.updatedAt)}</p>
          </Card>

          {d.comms ? (
            <Card title="Recent messages" actions={<Link href={`/admin/communications?family=${d.family.id}`} className="text-blue">History →</Link>} padded={false}>
              {d.comms.length === 0 ? (
                <p className="px-5 py-4 text-[0.85rem] text-ink-soft">No messages yet.</p>
              ) : (
                <ul className="divide-y divide-ink/6">
                  {d.comms.map((m) => (
                    <li key={m.id} className="px-5 py-2.5">
                      <p className="truncate text-[0.84rem] text-ink">{m.subject}</p>
                      <p className="flex flex-wrap items-center gap-2 text-[0.72rem] text-ink-soft">
                        {m.toAddress} · {fmtDateTime(m.createdAt)} <Status kind="message" value={m.status} />
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}

          {d.history ? (
            <Card title="Record history" padded={false}>
              <ul className="divide-y divide-ink/6">
                {d.history.map((h) => (
                  <li key={h.id} className="px-5 py-2.5">
                    <p className="text-[0.82rem] text-ink">{h.summary}</p>
                    <p className="text-[0.72rem] text-ink-soft">
                      {h.actorName} · {fmtDateTime(h.at)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {manage ? (
            <Card title={d.family.status === "archived" ? "Restore family" : "Archive family"}>
              {d.family.status === "archived" ? (
                <ActionForm action={restoreFamilyAction} submit={{ label: "Restore", variant: "secondary" }}>
                  <input type="hidden" name="familyId" value={d.family.id} />
                </ActionForm>
              ) : (
                <ActionForm
                  action={archiveFamilyAction}
                  submit={{ label: "Archive family", variant: "secondary" }}
                  confirm={{ title: `Archive ${d.family.name}?`, body: "They’ll be hidden from the directory. Bookings, payments and signed paperwork are kept and can be restored.", confirmLabel: "Archive", danger: true }}
                >
                  <input type="hidden" name="familyId" value={d.family.id} />
                  <p className="text-[0.8rem] text-ink-soft">Families with bookings, payments or signed paperwork are archived, never deleted.</p>
                </ActionForm>
              )}
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

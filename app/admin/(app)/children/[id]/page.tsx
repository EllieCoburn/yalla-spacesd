import Link from "next/link";
import { notFound } from "next/navigation";
import { EmergencyList, PickupList } from "@/components/admin/families/ContactForms";
import { NotesPanel } from "@/components/admin/families/Notes";
import { PaperworkList, PaperworkSummary } from "@/components/admin/families/PaperworkList";
import { ActionForm, Disclosure, SelectField, TextArea, TextField } from "@/components/admin/forms";
import { Card, DL, Empty, LinkButton, Notice, PageHeader, Pill, Status, Table } from "@/components/admin/ui";
import { updateChildAction } from "@/app/admin/(app)/families/actions";
import { childProfile } from "@/lib/admin/queries/families";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { WEEKDAY } from "@/lib/ops/memberships";
import { ageLabel, fmtDate, fmtDateTime, fmtTime, todayLA } from "@/lib/time";

function Stamp({ at, by }: { at: Date | null; by: string | null }) {
  return <p className="mt-3 text-[0.74rem] text-ink-soft">{at ? `Last updated ${fmtDateTime(at)}${by ? ` by ${by}` : ""}` : "Not yet provided"}</p>;
}

export default async function ChildPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission("families.view");
  const { id } = await params;
  const d = await childProfile(getDb(), staff, id);
  if (!d) notFound();
  const c = d.child;
  const today = todayLA();
  const manage = can(staff, "families.manage");
  const display = c.preferredName || c.firstName;
  const activeMembership = d.memberships.find((m) => ["active", "upcoming", "paused"].includes(m.m.status));
  const cohortName = d.cohorts.find((x) => x.id === c.cohortId)?.name ?? null;
  const paperwork = d.paperwork ? [...(d.paperwork.get(c.id) ?? []), ...(d.paperwork.get("family") ?? [])] : null;
  const kids = [{ id: c.id, name: display }];

  return (
    <>
      <PageHeader
        back={{ href: `/admin/families/${d.family.id}`, label: d.family.name }}
        title={
          <>
            {display} {c.lastName}
            {c.preferredName ? <span className="ml-2 text-[1rem] text-ink-soft">(legal first name {c.firstName})</span> : null}
          </>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>
              {ageLabel(c.birthDate, today)} today · born {fmtDate(c.birthDate, "d MMMM yyyy")}
            </span>
            {cohortName ? <Pill tone="neutral">{cohortName}</Pill> : <Pill tone="muted">No cohort</Pill>}
            {activeMembership ? <Pill tone="info" icon="check">Club Yalla</Pill> : null}
            {c.allergies ? <Pill tone="critical" icon="alert">Allergy</Pill> : null}
          </span>
        }
        actions={can(staff, "bookings.manage") ? <LinkButton href={`/admin/bookings/new?family=${d.family.id}&child=${c.id}`} variant="primary">Book care</LinkButton> : null}
      />

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card title="Details">
            <DL
              cols={3}
              items={[
                { label: "Age today", value: ageLabel(c.birthDate, today) },
                { label: "Age on next session", value: d.nextSessionDate ? `${ageLabel(c.birthDate, d.nextSessionDate)} on ${fmtDate(d.nextSessionDate, "EEE d MMM")}` : "No upcoming sessions" },
                { label: "Cohort", value: cohortName ?? "Not assigned" },
                { label: "Guardians", value: d.guardians.map((g) => `${g.name}${g.isPrimary ? " (primary)" : ""}`).join(", "), full: true },
              ]}
            />
            {manage ? (
              <div className="mt-4">
                <Disclosure label="Edit details">
                  <ActionForm action={updateChildAction} submit={{ label: "Save details" }}>
                    <input type="hidden" name="childId" value={c.id} />
                    <input type="hidden" name="section" value="basics" />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <TextField name="firstName" label="Legal first name" required defaultValue={c.firstName} />
                      <TextField name="lastName" label="Last name" defaultValue={c.lastName} />
                      <TextField name="preferredName" label="Preferred name" defaultValue={c.preferredName} />
                      <TextField name="birthDate" label="Date of birth" type="date" required defaultValue={c.birthDate} />
                      <SelectField name="cohortId" label="Cohort" defaultValue={c.cohortId ?? ""} options={[{ value: "", label: "Not assigned" }, ...d.cohorts.map((x) => ({ value: x.id, label: x.name }))]} hint="Changing a Club Yalla member’s cohort should be done as a planned membership change." />
                    </div>
                  </ActionForm>
                </Disclosure>
              </div>
            ) : null}
          </Card>

          {d.canCare ? (
            <Card title="Care information" actions={<Pill tone="neutral">Provided by the family</Pill>}>
              <DL
                cols={1}
                items={[
                  { label: "Allergies", value: c.allergies ? <span className="font-medium text-[#8a2333]">{c.allergies}</span> : "None recorded" },
                  { label: "Medical notes", value: c.medicalNotes ?? "None recorded" },
                  { label: "Care notes", value: c.careNotes ? <span className="whitespace-pre-wrap">{c.careNotes}</span> : "None recorded" },
                ]}
              />
              <Stamp at={c.infoUpdatedAt} by={c.infoUpdatedBy} />
              {manage ? (
                <div className="mt-3">
                  <Disclosure label="Update care information">
                    <p className="mb-3 text-[0.78rem] text-ink-soft">Record what the family has told you. Use staff-only notes for your own observations.</p>
                    <ActionForm action={updateChildAction} submit={{ label: "Save care information" }}>
                      <input type="hidden" name="childId" value={c.id} />
                      <input type="hidden" name="section" value="care" />
                      <TextArea name="allergies" label="Allergies" rows={2} defaultValue={c.allergies} />
                      <TextArea name="medicalNotes" label="Medical notes" rows={2} defaultValue={c.medicalNotes} />
                      <TextArea name="careNotes" label="Care notes (routines, comfort, rest…)" rows={3} defaultValue={c.careNotes} />
                    </ActionForm>
                  </Disclosure>
                </div>
              ) : null}
            </Card>
          ) : (
            <Notice tone="muted" title="Care information is restricted">Your role doesn’t include allergies, care notes or departure details.</Notice>
          )}

          {d.canStaffNotes ? (
            <Card title="Staff-only notes" actions={<Pill tone="muted" icon="minus">Never shown to families</Pill>} className="border-dashed">
              <p className="text-[0.88rem] whitespace-pre-wrap text-ink">{c.staffNotes || <span className="text-ink-soft">No staff notes.</span>}</p>
              <Stamp at={c.staffNotesUpdatedAt} by={c.staffNotesUpdatedBy} />
              {manage ? (
                <div className="mt-3">
                  <Disclosure label="Edit staff notes">
                    <ActionForm action={updateChildAction} submit={{ label: "Save staff notes" }}>
                      <input type="hidden" name="childId" value={c.id} />
                      <input type="hidden" name="section" value="staffNotes" />
                      <TextArea name="staffNotes" label="Staff-only notes" rows={4} defaultValue={c.staffNotes} />
                    </ActionForm>
                  </Disclosure>
                </div>
              ) : null}
            </Card>
          ) : null}

          {can(staff, "bookings.view") ? (
            <Card title="Bookings" padded={false}>
              {d.upcoming.length === 0 && d.history.length === 0 ? (
                <div className="p-5">
                  <Empty title="No bookings yet" />
                </div>
              ) : (
                <Table head={["Date", "Program", "Age that day", "Booking", "Status", "Attendance"]} dense>
                  {[...d.upcoming, ...d.history.slice(0, 30)].map((r) => (
                    <tr key={r.i.id}>
                      <td className="whitespace-nowrap">
                        {fmtDate(r.s.localDate, "EEE d MMM yyyy")}
                        <span className="block text-[0.74rem] text-ink-soft">
                          {fmtTime(r.s.startsAt)}–{fmtTime(r.s.endsAt)}
                        </span>
                      </td>
                      <td>{r.p.name}</td>
                      <td>{ageLabel(c.birthDate, r.s.localDate)}</td>
                      <td>
                        <Link href={`/admin/bookings/${r.b.id}`} className="text-blue hover:underline">
                          {r.b.reference}
                        </Link>
                      </td>
                      <td>
                        <Status kind="item" value={r.i.status} />
                      </td>
                      <td>{r.i.status === "confirmed" ? <Status kind="attendance" value={r.i.attendance} /> : null}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>
          ) : null}

          <Card title="Attendance history" padded={false}>
            {d.attendance.length === 0 ? (
              <p className="px-5 py-4 text-[0.85rem] text-ink-soft">No check-ins recorded yet.</p>
            ) : (
              <Table head={["Date", "Session", "Status", "In", "Out", "Collected by", "Notes"]} dense>
                {d.attendance.map((a) => (
                  <tr key={a.a.id}>
                    <td className="whitespace-nowrap">{fmtDate(a.s.localDate, "EEE d MMM yyyy")}</td>
                    <td>{a.s.title ?? a.p.name}</td>
                    <td>
                      <Status kind="attendance" value={a.a.status} />
                    </td>
                    <td className="tabular-nums">{a.a.checkedInAt ? fmtTime(a.a.checkedInAt) : "—"}</td>
                    <td className="tabular-nums">{a.a.checkedOutAt ? fmtTime(a.a.checkedOutAt) : "—"}</td>
                    <td>{d.canCare ? (a.a.collectedByName ?? "—") : "—"}</td>
                    <td className="max-w-[16rem] text-[0.8rem] text-ink-soft">{a.a.notes ?? ""}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          <Card title="Notes about this child">
            <NotesPanel familyId={d.family.id} childId={c.id} notes={d.notes} canWrite={manage} canCare={d.canCare} />
          </Card>
        </div>

        <div className="space-y-6">
          {paperwork ? (
            <Card id="paperwork" title="Forms & waivers" actions={<PaperworkSummary items={paperwork} />}>
              <PaperworkList items={paperwork} familyId={d.family.id} childNames={new Map([[c.id, display]])} canRecord={can(staff, "forms.manage")} />
            </Card>
          ) : null}

          {can(staff, "memberships.view") ? (
            <Card title="Club Yalla" padded={false}>
              {d.memberships.length === 0 ? (
                <p className="px-5 py-4 text-[0.85rem] text-ink-soft">Not a member.</p>
              ) : (
                <ul className="divide-y divide-ink/6">
                  {d.memberships.map(({ m, co }) => (
                    <li key={m.id}>
                      <Link href={`/admin/memberships/${m.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-mist/30">
                        <span>
                          <span className="block text-[0.86rem] text-ink">
                            {co.name} · {m.weekdays.map((w) => WEEKDAY[w]).join(", ")}
                          </span>
                          <span className="text-[0.76rem] text-ink-soft">
                            {m.dayLength === "half" ? "Half day" : "Full day"}
                            {m.earlyBird ? " + Early Bird" : ""} · {fmtDate(m.startsOn, "d MMM yyyy")}
                            {m.endsOn ? `–${fmtDate(m.endsOn, "d MMM yyyy")}` : " onward"}
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

          {d.pickups ? (
            <Card title="Departure contacts & restrictions">
              <p className="mb-2 text-[0.78rem] text-ink-soft">Guardians ({d.guardians.map((g) => g.name).join(", ")}) can always collect {display}.</p>
              <PickupList familyId={d.family.id} pickups={d.pickups} kids={kids} canEdit={manage} />
            </Card>
          ) : null}

          <Card title="Emergency contacts">
            <EmergencyList familyId={d.family.id} contacts={d.emergency} kids={kids} canEdit={manage} />
          </Card>
        </div>
      </div>
    </>
  );
}

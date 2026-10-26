import { ActionForm, Checkbox, Disclosure, SelectField, TextArea, TextField } from "@/components/admin/forms";
import { Pill } from "@/components/admin/ui";
import { removeEmergencyAction, removePickupAction, saveEmergencyAction, savePickupAction } from "@/app/admin/(app)/families/actions";
import type { authorizedPickups, emergencyContacts } from "@/lib/db/schema";
import { fmtDateTime } from "@/lib/time";

type Kid = { id: string; name: string };

const childOptions = (kids: Kid[]) => [{ value: "", label: "All children in the family" }, ...kids.map((k) => ({ value: k.id, label: k.name }))];

function PickupFields({ p, kids }: { p?: typeof authorizedPickups.$inferSelect; kids: Kid[] }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField name="name" label="Full name" required defaultValue={p?.name} />
        <TextField name="relationship" label="Relationship" defaultValue={p?.relationship} />
        <TextField name="phone" label="Phone" type="tel" defaultValue={p?.phone} />
        <SelectField name="childId" label="Applies to" options={childOptions(kids)} defaultValue={p?.childId ?? ""} />
      </div>
      <Checkbox name="isRestricted" label="This person is NOT permitted to collect the child" hint="Shows as a restriction on rosters and blocks check-out to this person." defaultChecked={p?.isRestricted} />
      <TextArea name="restrictionNote" label="Restriction details (staff only)" rows={2} defaultValue={p?.restrictionNote} />
    </>
  );
}

export function PickupList({ familyId, pickups, kids, canEdit }: { familyId: string; pickups: (typeof authorizedPickups.$inferSelect)[]; kids: Kid[]; canEdit: boolean }) {
  const kidName = new Map(kids.map((k) => [k.id, k.name]));
  const sorted = [...pickups].sort((a, b) => Number(b.isRestricted) - Number(a.isRestricted));
  return (
    <div className="space-y-3">
      {sorted.length === 0 ? <p className="text-[0.85rem] text-ink-soft">No additional departure contacts. Guardians can always collect their children.</p> : null}
      <ul className="divide-y divide-ink/6">
        {sorted.map((p) => (
          <li key={p.id} className="py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[0.86rem] text-ink">
                  {p.name} <span className="text-ink-soft">{p.relationship ? `· ${p.relationship}` : ""}</span>
                </p>
                <p className="text-[0.75rem] text-ink-soft">
                  {p.phone ?? "No phone"} · {p.childId ? `Only ${kidName.get(p.childId) ?? "one child"}` : "All children"}
                  {p.updatedBy ? ` · updated by ${p.updatedBy}, ${fmtDateTime(p.updatedAt)}` : ""}
                </p>
                {p.isRestricted && p.restrictionNote ? <p className="mt-1 text-[0.78rem] text-[#8a2333]">{p.restrictionNote}</p> : null}
              </div>
              {p.isRestricted ? <Pill tone="critical" icon="x">Not permitted</Pill> : <Pill tone="positive" icon="check">Authorized</Pill>}
            </div>
            {canEdit ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <Disclosure label="Edit">
                  <ActionForm action={savePickupAction} submit={{ label: "Save" }}>
                    <input type="hidden" name="familyId" value={familyId} />
                    <input type="hidden" name="pickupId" value={p.id} />
                    <PickupFields p={p} kids={kids} />
                  </ActionForm>
                </Disclosure>
                <ActionForm action={removePickupAction} submit={{ label: "Remove", variant: "ghost" }} confirm={{ title: `Remove ${p.name}?`, body: p.isRestricted ? "This removes the departure restriction." : "They will no longer be listed as an authorized pickup.", confirmLabel: "Remove", danger: true }}>
                  <input type="hidden" name="familyId" value={familyId} />
                  <input type="hidden" name="pickupId" value={p.id} />
                </ActionForm>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {canEdit ? (
        <Disclosure label="Add departure contact or restriction">
          <ActionForm action={savePickupAction} submit={{ label: "Add" }} resetOnSuccess>
            <input type="hidden" name="familyId" value={familyId} />
            <PickupFields kids={kids} />
          </ActionForm>
        </Disclosure>
      ) : null}
    </div>
  );
}

function EmergencyFields({ c, kids }: { c?: typeof emergencyContacts.$inferSelect; kids: Kid[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField name="name" label="Name" required defaultValue={c?.name} />
      <TextField name="phone" label="Phone" type="tel" required defaultValue={c?.phone} />
      <TextField name="relationship" label="Relationship" defaultValue={c?.relationship} />
      <SelectField name="priority" label="Call order" options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}` }))} defaultValue={c?.priority ?? 1} />
      <SelectField name="childId" label="Applies to" options={childOptions(kids)} defaultValue={c?.childId ?? ""} />
    </div>
  );
}

export function EmergencyList({ familyId, contacts, kids, canEdit }: { familyId: string; contacts: (typeof emergencyContacts.$inferSelect)[]; kids: Kid[]; canEdit: boolean }) {
  const kidName = new Map(kids.map((k) => [k.id, k.name]));
  return (
    <div className="space-y-3">
      {contacts.length === 0 ? <p className="text-[0.85rem] text-[#8a5212]">No emergency contacts on file.</p> : null}
      <ul className="divide-y divide-ink/6">
        {contacts.map((c) => (
          <li key={c.id} className="py-2.5">
            <p className="text-[0.86rem] text-ink">
              <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-ink/8 text-[0.7rem] tabular-nums">{c.priority}</span>
              {c.name} <span className="text-ink-soft">{c.relationship ? `· ${c.relationship}` : ""}</span>
            </p>
            <p className="text-[0.75rem] text-ink-soft">
              <a href={`tel:${c.phone}`} className="hover:underline">
                {c.phone}
              </a>{" "}
              · {c.childId ? `Only ${kidName.get(c.childId) ?? "one child"}` : "All children"} · updated {fmtDateTime(c.updatedAt)}
            </p>
            {canEdit ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <Disclosure label="Edit">
                  <ActionForm action={saveEmergencyAction} submit={{ label: "Save" }}>
                    <input type="hidden" name="familyId" value={familyId} />
                    <input type="hidden" name="contactId" value={c.id} />
                    <EmergencyFields c={c} kids={kids} />
                  </ActionForm>
                </Disclosure>
                <ActionForm action={removeEmergencyAction} submit={{ label: "Remove", variant: "ghost" }} confirm={{ title: `Remove ${c.name}?`, confirmLabel: "Remove", danger: true }}>
                  <input type="hidden" name="familyId" value={familyId} />
                  <input type="hidden" name="contactId" value={c.id} />
                </ActionForm>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {canEdit ? (
        <Disclosure label="Add emergency contact">
          <ActionForm action={saveEmergencyAction} submit={{ label: "Add" }} resetOnSuccess>
            <input type="hidden" name="familyId" value={familyId} />
            <EmergencyFields kids={kids} />
          </ActionForm>
        </Disclosure>
      ) : null}
    </div>
  );
}

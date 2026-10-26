import { ActionForm, SelectField, TextArea } from "@/components/admin/forms";
import { Pill } from "@/components/admin/ui";
import { addNoteAction } from "@/app/admin/(app)/families/actions";
import type { familyNotes } from "@/lib/db/schema";
import { fmtDateTime } from "@/lib/time";

export function NotesPanel({ familyId, childId, notes, canWrite, canCare }: { familyId: string; childId?: string; notes: (typeof familyNotes.$inferSelect)[]; canWrite: boolean; canCare: boolean }) {
  return (
    <div className="space-y-4">
      {notes.length === 0 ? <p className="text-[0.85rem] text-ink-soft">No internal notes yet.</p> : null}
      <ul className="space-y-3">
        {notes.map((n) => (
          <li key={n.id} className="rounded-lg border border-ink/8 bg-white px-3 py-2.5">
            <p className="text-[0.86rem] whitespace-pre-wrap text-ink">{n.body}</p>
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[0.72rem] text-ink-soft">
              {n.visibility === "care" ? <Pill tone="info" icon="dot">Care team</Pill> : <Pill tone="muted" icon="minus">Staff only</Pill>}
              {n.authorName} · {fmtDateTime(n.createdAt)}
            </p>
          </li>
        ))}
      </ul>
      {canWrite ? (
        <ActionForm action={addNoteAction} submit={{ label: "Add note", variant: "secondary" }} resetOnSuccess>
          <input type="hidden" name="familyId" value={familyId} />
          {childId ? <input type="hidden" name="childId" value={childId} /> : null}
          <TextArea name="body" label="New internal note" rows={2} hint="Never shown to families." required />
          {canCare ? (
            <SelectField
              name="visibility"
              label="Who can see it"
              options={[
                { value: "staff", label: "Staff with family access" },
                { value: "care", label: "Care team (staff with care-information access)" },
              ]}
            />
          ) : null}
        </ActionForm>
      ) : null}
    </div>
  );
}

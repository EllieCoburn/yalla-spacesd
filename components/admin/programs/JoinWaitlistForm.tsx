"use client";

import { useState } from "react";
import { ActionForm, TextArea } from "@/components/admin/forms";
import { inputCls } from "@/components/admin/ui";
import { joinAction } from "@/app/admin/(app)/waitlist/actions";

type Fam = { id: string; name: string; children: { id: string; firstName: string; preferredName: string | null }[] };

export function JoinWaitlistForm({ families, sessions }: { families: Fam[]; sessions: { id: string; label: string }[] }) {
  const [familyId, setFamilyId] = useState("");
  const fam = families.find((f) => f.id === familyId);
  return (
    <ActionForm action={joinAction} submit={{ label: "Add to waitlist" }} resetOnSuccess onSuccess={() => setFamilyId("")}>
      <div className="space-y-1.5">
        <label htmlFor="wl-family" className="block text-[0.8rem] font-medium text-ink">
          Family <span className="text-[#8a2333]">*</span>
        </label>
        <select id="wl-family" name="familyId" required value={familyId} onChange={(e) => setFamilyId(e.target.value)} className={inputCls}>
          <option value="">Choose a family…</option>
          {families.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>
      {fam ? (
        <fieldset>
          <legend className="mb-1.5 block text-[0.8rem] font-medium text-ink">Children</legend>
          {fam.children.length === 0 ? (
            <p className="text-[0.8rem] text-ink-soft">This family has no children on file.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {fam.children.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-[0.86rem]">
                  <input type="checkbox" name="childIds" value={c.id} defaultChecked className="h-4 w-4 rounded border-ink/30" />
                  {c.preferredName || c.firstName}
                </label>
              ))}
            </div>
          )}
        </fieldset>
      ) : null}
      <div className="space-y-1.5">
        <label htmlFor="wl-session" className="block text-[0.8rem] font-medium text-ink">
          Session <span className="text-[#8a2333]">*</span>
        </label>
        <select id="wl-session" name="sessionId" required className={inputCls} defaultValue="">
          <option value="">Choose a session…</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <TextArea name="notes" label="Notes (staff only)" rows={2} />
    </ActionForm>
  );
}

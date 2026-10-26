"use client";

import { useState } from "react";
import { sendManualAction } from "@/app/admin/(app)/communications/actions";
import { ActionForm, SelectField, TextArea } from "@/components/admin/forms";

export function ManualMessage({ families, templates }: { families: { id: string; name: string }[]; templates: { key: string; name: string; variables: string[] }[] }) {
  const [key, setKey] = useState(templates[0]?.key ?? "");
  const t = templates.find((x) => x.key === key);
  return (
    <ActionForm action={sendManualAction} submit={{ label: "Send message", pending: "Sending…" }} resetOnSuccess>
      <SelectField name="familyId" label="Family" required options={[{ value: "", label: "Choose a family…" }, ...families.map((f) => ({ value: f.id, label: f.name }))]} />
      <label className="block space-y-1.5">
        <span className="text-[0.8rem] font-medium">Template</span>
        <select name="template" value={key} onChange={(e) => setKey(e.target.value)} className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-[0.88rem]">
          {templates.map((x) => (
            <option key={x.key} value={x.key}>
              {x.name}
            </option>
          ))}
        </select>
      </label>
      {t?.variables
        .filter((v) => v !== "guardian_first_name")
        .map((v) => (
          <TextArea key={`${key}-${v}`} name={`var_${v}`} label={v.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())} rows={v.includes("details") || v.includes("summary") || v.includes("forms") ? 3 : 1} required />
        ))}
      <p className="text-[0.75rem] text-ink-soft">Each guardian’s first name is filled in automatically. Billing templates go only to guardians who can see billing.</p>
    </ActionForm>
  );
}

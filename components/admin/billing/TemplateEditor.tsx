"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { resetTemplateAction, saveTemplateAction } from "@/app/admin/(app)/communications/actions";
import { btn, inputCls } from "@/components/admin/ui";

function render(text: string, vars: Record<string, string>) {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

function Save({ label, variant = "primary" }: { label: string; variant?: "primary" | "ghost" }) {
  const { pending } = useFormStatus();
  return (
    <button className={btn[variant]} disabled={pending}>
      {pending ? "Saving…" : label}
    </button>
  );
}

export function TemplateEditor({
  templateKey,
  initialSubject,
  initialBody,
  variables,
  samples,
  canEdit,
  customized,
}: {
  templateKey: string;
  initialSubject: string;
  initialBody: string;
  variables: string[];
  samples: Record<string, string>;
  canEdit: boolean;
  customized: boolean;
}) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [state, action] = useActionState(saveTemplateAction, undefined);
  const [resetState, resetAction] = useActionState(resetTemplateAction, undefined);
  const preview = useMemo(() => ({ subject: render(subject, samples), body: render(body, samples) }), [subject, body, samples]);

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <form action={action} className="space-y-4">
        <input type="hidden" name="key" value={templateKey} />
        <label className="block space-y-1.5">
          <span className="text-[0.8rem] font-medium">Subject</span>
          <input name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!canEdit} className={inputCls} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-[0.8rem] font-medium">Message</span>
          <textarea name="body" rows={16} value={body} onChange={(e) => setBody(e.target.value)} disabled={!canEdit} className={`${inputCls} font-mono text-[0.82rem] leading-relaxed`} />
        </label>
        <div>
          <p className="text-[0.75rem] font-medium tracking-[0.04em] text-ink-soft uppercase">Available details</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {variables.map((v) => (
              <button
                type="button"
                key={v}
                disabled={!canEdit}
                onClick={() => setBody((b) => `${b}{{${v}}}`)}
                className="rounded-md border border-ink/12 bg-white px-2 py-1 font-mono text-[0.72rem] text-ink hover:border-blue disabled:opacity-60"
                title="Insert at the end of the message"
              >
                {`{{${v}}}`}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[0.75rem] text-ink-soft">Booking details, references, amounts and links are filled in from the real record when the message is sent, so they’re always accurate.</p>
        </div>
        {state ? (
          <p role={state.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-[0.85rem] ${state.ok ? "bg-[#e6f0ea] text-[#2c6447]" : "bg-[#f6e3e5] text-[#8a2333]"}`}>
            {state.ok ? state.message : state.error}
          </p>
        ) : null}
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Save label="Save template" />
          </div>
        ) : null}
      </form>
      <div className="space-y-3">
        <p className="text-[0.75rem] font-medium tracking-[0.04em] text-ink-soft uppercase">Preview with sample details</p>
        <div className="rounded-xl border border-ink/10 bg-white">
          <div className="border-b border-ink/8 px-4 py-3">
            <p className="text-[0.72rem] text-ink-soft">To: jordan@example.com</p>
            <p className="mt-0.5 text-[0.95rem] font-medium text-ink">{preview.subject}</p>
          </div>
          <pre className="px-4 py-4 font-sans text-[0.88rem] leading-relaxed whitespace-pre-wrap text-ink">{preview.body}</pre>
        </div>
        {canEdit && customized ? (
          <form action={resetAction}>
            <input type="hidden" name="key" value={templateKey} />
            <Save label="Restore Yalla’s default wording" variant="ghost" />
            {resetState?.message ? <span className="ml-2 text-[0.8rem] text-[#2c6447]">{resetState.message} Reload to see it.</span> : null}
          </form>
        ) : null}
      </div>
    </div>
  );
}

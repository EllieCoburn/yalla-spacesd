"use client";

/**
 * Form kit for server actions. An ActionForm echoes submitted values back on failure, so fields
 * keep what staff typed. Consequential actions can require a confirmation step.
 */
import { createContext, useActionState, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/admin/action";
import { btn, inputCls } from "./ui";

type Ctx = { values: Record<string, string>; state: ActionState };
const FormCtx = createContext<Ctx>({ values: {}, state: undefined });

export function useFormValue(name: string, fallback?: string | number | null) {
  const { values } = useContext(FormCtx);
  return values[name] ?? (fallback == null ? "" : String(fallback));
}

export function ActionForm({
  action,
  children,
  className = "space-y-4",
  submit,
  confirm,
  resetOnSuccess,
  onSuccess,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  submit?: { label: string; variant?: keyof typeof btn; pending?: string } | false;
  /** Shows a confirmation step before submitting. */
  confirm?: { title: string; body?: ReactNode; confirmLabel: string; danger?: boolean };
  resetOnSuccess?: boolean;
  onSuccess?: (s: ActionState) => void;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [keyBump, setKeyBump] = useState(0);
  const idem = useRef(crypto.randomUUID());

  useEffect(() => {
    if (state?.ok) {
      idem.current = crypto.randomUUID();
      onSuccess?.(state);
      if (resetOnSuccess) setKeyBump((k) => k + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.at]);

  return (
    <FormCtx.Provider value={{ values: state && !state.ok ? (state.values ?? {}) : {}, state }}>
      <form
        key={keyBump}
        ref={formRef}
        action={formAction}
        className={className}
        onSubmit={(e) => {
          if (confirm && !confirming) {
            e.preventDefault();
            setConfirming(true);
          }
        }}
      >
        <input type="hidden" name="idempotencyKey" value={idem.current} />
        {children}
        <FormMessage />
        {confirming && confirm ? (
          <div role="alertdialog" aria-labelledby="confirm-title" className="rounded-lg border border-ink/15 bg-mist/40 p-4">
            <p id="confirm-title" className="text-[0.9rem] font-semibold text-ink">
              {confirm.title}
            </p>
            {confirm.body ? <div className="mt-1 text-[0.85rem] text-ink-soft">{confirm.body}</div> : null}
            <div className="mt-3 flex gap-2">
              <SubmitButton label={confirm.confirmLabel} variant={confirm.danger ? "danger" : "primary"} onClick={() => setTimeout(() => setConfirming(false), 0)} />
              <button type="button" className={btn.ghost} onClick={() => setConfirming(false)}>
                Go back
              </button>
            </div>
          </div>
        ) : submit !== false ? (
          <div className="flex items-center gap-3">
            <SubmitButton label={submit?.label ?? "Save"} variant={submit?.variant ?? "primary"} pendingLabel={submit?.pending} asConfirmTrigger={!!confirm} />
          </div>
        ) : null}
      </form>
    </FormCtx.Provider>
  );
}

function FormMessage() {
  const { state } = useContext(FormCtx);
  const { pending } = useFormStatus();
  if (pending || !state) return null;
  if (!state.ok)
    return (
      <p role="alert" className="rounded-lg bg-[#f6e3e5] px-3 py-2 text-[0.85rem] text-[#8a2333] ring-1 ring-[#8a2333]/20 ring-inset">
        {state.error}
      </p>
    );
  return state.message ? (
    <p role="status" className="rounded-lg bg-[#e6f0ea] px-3 py-2 text-[0.85rem] text-[#2c6447] ring-1 ring-[#2c6447]/20 ring-inset">
      {state.message}
    </p>
  ) : null;
}

export function SubmitButton({ label, variant = "primary", pendingLabel, onClick, asConfirmTrigger }: { label: string; variant?: keyof typeof btn; pendingLabel?: string; onClick?: () => void; asConfirmTrigger?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={btn[variant]} disabled={pending} aria-disabled={pending} onClick={onClick} data-confirm-trigger={asConfirmTrigger || undefined}>
      {pending ? (
        <>
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />
          {pendingLabel ?? "Saving…"}
        </>
      ) : (
        label
      )}
    </button>
  );
}

function Label({ id, label, hint, required, children }: { id: string; label: string; hint?: ReactNode; required?: boolean; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[0.8rem] font-medium text-ink">
        {label}
        {required ? <span className="text-[#8a2333]"> *</span> : null}
      </label>
      {children}
      {hint ? <p className="text-[0.75rem] text-ink-soft">{hint}</p> : null}
    </div>
  );
}

type Common = { name: string; label: string; hint?: ReactNode; required?: boolean; defaultValue?: string | number | null; disabled?: boolean; className?: string };

export function TextField({ type = "text", placeholder, autoComplete, ...p }: Common & { type?: string; placeholder?: string; autoComplete?: string }) {
  const id = useId();
  const value = useFormValue(p.name, p.defaultValue);
  return (
    <div className={p.className}>
      <Label id={id} label={p.label} hint={p.hint} required={p.required}>
        <input id={id} name={p.name} type={type} defaultValue={value} key={value} required={p.required} disabled={p.disabled} placeholder={placeholder} autoComplete={autoComplete} className={inputCls} />
      </Label>
    </div>
  );
}

export function MoneyField(p: Common) {
  const id = useId();
  const value = useFormValue(p.name, p.defaultValue == null ? null : (Number(p.defaultValue) / 100).toFixed(2));
  return (
    <div className={p.className}>
      <Label id={id} label={p.label} hint={p.hint} required={p.required}>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[0.88rem] text-ink-soft">$</span>
          <input id={id} name={p.name} inputMode="decimal" defaultValue={value} key={value} required={p.required} disabled={p.disabled} className={`${inputCls} pl-7 tabular-nums`} />
        </div>
      </Label>
    </div>
  );
}

export function TextArea(p: Common & { rows?: number; placeholder?: string }) {
  const id = useId();
  const value = useFormValue(p.name, p.defaultValue);
  return (
    <div className={p.className}>
      <Label id={id} label={p.label} hint={p.hint} required={p.required}>
        <textarea id={id} name={p.name} rows={p.rows ?? 3} defaultValue={value} key={value} required={p.required} disabled={p.disabled} placeholder={p.placeholder} className={inputCls} />
      </Label>
    </div>
  );
}

export function SelectField({ options, ...p }: Common & { options: { value: string; label: string }[] }) {
  const id = useId();
  const value = useFormValue(p.name, p.defaultValue);
  return (
    <div className={p.className}>
      <Label id={id} label={p.label} hint={p.hint} required={p.required}>
        <select id={id} name={p.name} defaultValue={value} key={value} required={p.required} disabled={p.disabled} className={inputCls}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Label>
    </div>
  );
}

export function Checkbox({ name, label, hint, defaultChecked, disabled }: { name: string; label: ReactNode; hint?: ReactNode; defaultChecked?: boolean; disabled?: boolean }) {
  const { values } = useContext(FormCtx);
  const checked = name in values ? values[name] === "on" : (defaultChecked ?? false);
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <input id={id} type="checkbox" name={name} defaultChecked={checked} key={String(checked)} disabled={disabled} className="mt-0.5 h-4 w-4 rounded border-ink/30 text-blue focus:ring-blue/30" />
      <label htmlFor={id} className="text-[0.85rem] text-ink">
        {label}
        {hint ? <span className="mt-0.5 block text-[0.75rem] text-ink-soft">{hint}</span> : null}
      </label>
    </div>
  );
}

export function WeekdayPicker({ name, defaultValue = [] }: { name: string; defaultValue?: number[] }) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <fieldset>
      <legend className="mb-1.5 block text-[0.8rem] font-medium text-ink">Weekdays</legend>
      <div className="flex flex-wrap gap-1.5">
        {days.map((d, i) => (
          <label key={d} className="cursor-pointer">
            <input type="checkbox" name={name} value={i} defaultChecked={defaultValue.includes(i)} className="peer sr-only" />
            <span className="inline-flex h-9 w-12 items-center justify-center rounded-lg border border-ink/15 text-[0.82rem] transition-colors peer-checked:border-ink peer-checked:bg-ink peer-checked:text-chalk peer-focus-visible:ring-2 peer-focus-visible:ring-blue/40">
              {d}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** A disclosure for secondary actions (keeps pages calm). */
export function Disclosure({ label, children, defaultOpen }: { label: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="group rounded-lg border border-ink/10 bg-white open:shadow-sm" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-[0.86rem] font-medium text-ink [&::-webkit-details-marker]:hidden">
        {label}
        <span className="text-ink-soft transition-transform group-open:rotate-180" aria-hidden>
          ▾
        </span>
      </summary>
      <div className="border-t border-ink/8 p-4">{children}</div>
    </details>
  );
}

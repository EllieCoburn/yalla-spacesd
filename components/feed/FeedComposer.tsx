"use client";

/**
 * Adding to a child's day: Photo, Food, Nap, Potty and Message, each one tap away. Photos are resized
 * in the browser (longest side 1600px, JPEG) before they're sent, so phone photos upload quickly.
 */
import { useRef, useState } from "react";
import { ActionForm, TextArea, TextField } from "@/components/admin/forms";
import type { ActionState } from "@/lib/admin/action";

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;
type Opt = { key: string; label: string };

const TABS = [
  { key: "photo", label: "Photo" },
  { key: "food", label: "Food" },
  { key: "nap", label: "Nap" },
  { key: "potty", label: "Potty" },
  { key: "message", label: "Message parents" },
] as const;

function Choice({ name, options, value, onChange }: { name: string; options: readonly Opt[]; value: string; onChange: (v: string) => void }) {
  return (
    <div role="radiogroup" className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label key={o.key} className={`cursor-pointer rounded-full border px-4 py-2 text-[0.88rem] transition-colors ${value === o.key ? "border-ink bg-ink text-chalk" : "border-ink/15 bg-white text-ink hover:border-ink/40"}`}>
          <input type="radio" name={name} value={o.key} checked={value === o.key} onChange={() => onChange(o.key)} className="sr-only" />
          {o.label}
        </label>
      ))}
    </div>
  );
}

async function resize(file: File): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("resize"))), "image/jpeg", 0.82));
    return new File([blob], "photo.jpg", { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function FeedComposer({
  action,
  sessionId,
  childId,
  childName,
  now,
  meals,
  amounts,
  potty,
}: {
  action: Action;
  sessionId: string;
  childId: string;
  childName: string;
  now: string;
  meals: readonly Opt[];
  amounts: readonly Opt[];
  potty: Record<string, { label: string; results: readonly Opt[] }>;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("photo");
  const hour = Number(now.slice(0, 2));
  const [meal, setMeal] = useState(hour < 9 ? "breakfast" : hour < 11 ? "am_snack" : hour < 13 ? "lunch" : hour < 17 ? "pm_snack" : "dinner");
  const [amount, setAmount] = useState("");
  const [pType, setPType] = useState("diaper");
  const [pResult, setPResult] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const hidden = (
    <>
      <input type="hidden" name="kind" value={tab} />
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="childId" value={childId} />
    </>
  );
  const reset = () => {
    setAmount("");
    setPResult("");
    setPreview(null);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={`rounded-lg px-3.5 py-2 text-[0.88rem] font-medium transition-colors ${tab === t.key ? "bg-blue text-white" : "bg-ink/[0.05] text-ink hover:bg-ink/10"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "photo" ? (
        <ActionForm key="photo" action={action} resetOnSuccess onSuccess={reset} submit={{ label: busy ? "Getting the photo ready…" : "Add photo", pending: "Uploading…" }}>
          {hidden}
          <div>
            <label className="block text-[0.82rem] font-medium text-ink">Photo</label>
            <input
              ref={fileRef}
              type="file"
              name="photo"
              accept="image/*"
              required
              className="mt-1 block w-full text-[0.88rem] file:mr-3 file:rounded-lg file:border-0 file:bg-ink file:px-3.5 file:py-2 file:text-chalk"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return setPreview(null);
                setBusy(true);
                try {
                  const small = await resize(f);
                  const dt = new DataTransfer();
                  dt.items.add(small);
                  if (fileRef.current) fileRef.current.files = dt.files;
                  setPreview(URL.createObjectURL(small));
                } catch {
                  setPreview(URL.createObjectURL(f));
                } finally {
                  setBusy(false);
                }
              }}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {preview ? <img src={preview} alt="" className="mt-3 max-h-64 rounded-lg border border-ink/10" /> : null}
          </div>
          <TextField name="caption" label="Caption" hint="Optional" placeholder={`What ${childName} was up to`} />
          <TextField name="time" type="time" label="Time" defaultValue={now} className="max-w-[10rem]" />
        </ActionForm>
      ) : null}

      {tab === "food" ? (
        <ActionForm key="food" action={action} resetOnSuccess onSuccess={reset} submit={{ label: "Add food" }}>
          {hidden}
          <div>
            <p className="mb-1.5 text-[0.82rem] font-medium text-ink">Meal</p>
            <Choice name="meal" options={meals} value={meal} onChange={setMeal} />
          </div>
          <div>
            <p className="mb-1.5 text-[0.82rem] font-medium text-ink">How much</p>
            <Choice name="amount" options={amounts} value={amount} onChange={setAmount} />
          </div>
          <TextField name="items" label="What they had" hint="Optional" placeholder="Apple slices, crackers, water" />
          <TextField name="note" label="Note" hint="Optional" />
          <TextField name="time" type="time" label="Time" defaultValue={now} className="max-w-[10rem]" />
        </ActionForm>
      ) : null}

      {tab === "nap" ? (
        <ActionForm key="nap" action={action} resetOnSuccess submit={{ label: "Add nap" }}>
          {hidden}
          <div className="grid max-w-sm grid-cols-2 gap-3">
            <TextField name="start" type="time" label="Fell asleep" defaultValue={now} required />
            <TextField name="end" type="time" label="Woke up" hint="Leave blank if still asleep" />
          </div>
          <TextField name="note" label="Note" hint="Optional" />
        </ActionForm>
      ) : null}

      {tab === "potty" ? (
        <ActionForm key="potty" action={action} resetOnSuccess onSuccess={reset} submit={{ label: "Add potty" }}>
          {hidden}
          <div>
            <p className="mb-1.5 text-[0.82rem] font-medium text-ink">Type</p>
            <Choice
              name="type"
              options={Object.entries(potty).map(([key, v]) => ({ key, label: v.label }))}
              value={pType}
              onChange={(v) => {
                setPType(v);
                setPResult("");
              }}
            />
          </div>
          <div>
            <p className="mb-1.5 text-[0.82rem] font-medium text-ink">{pType === "diaper" ? "Diaper was" : "On the toilet"}</p>
            <Choice name="result" options={potty[pType]?.results ?? []} value={pResult} onChange={setPResult} />
          </div>
          <TextField name="note" label="Note" hint="Optional" />
          <TextField name="time" type="time" label="Time" defaultValue={now} className="max-w-[10rem]" />
        </ActionForm>
      ) : null}

      {tab === "message" ? (
        <ActionForm key="message" action={action} resetOnSuccess submit={{ label: "Send to parents" }}>
          {hidden}
          <TextArea name="body" label={`Message ${childName}’s parents`} rows={4} required hint="They get an email and see it on their Family Portal today, and can reply there." />
        </ActionForm>
      ) : null}
    </div>
  );
}

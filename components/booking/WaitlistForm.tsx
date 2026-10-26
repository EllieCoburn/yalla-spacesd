"use client";

import { useState, useTransition } from "react";
import { joinWaitlistAction } from "@/app/(site)/book/actions";
import { Mark } from "@/components/brand/Mark";
import type { PublicSession } from "@/lib/ops/public-booking";
import { fmtDate, fmtTime } from "@/lib/time";
import type { SavedChild, SignedInGuardian } from "./Checkout";

const input = "w-full border-0 border-b border-ink/20 bg-transparent px-0 py-2.5 text-[1rem] focus:border-blue focus:ring-0 focus:outline-none";

/** Join the waitlist for a full session. Nothing is charged; we offer the spot if one opens. */
export function WaitlistForm({ session, guardian, savedChildren, onClose }: { session: PublicSession; guardian: SignedInGuardian | null; savedChildren: SavedChild[]; onClose: () => void }) {
  const [adult, setAdult] = useState({ firstName: guardian?.firstName ?? "", lastName: guardian?.lastName ?? "", email: guardian?.email ?? "" });
  const [childId, setChildId] = useState<string>(savedChildren[0]?.id ?? "");
  const [child, setChild] = useState({ firstName: "", birthDate: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string; devLink?: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Join the waitlist">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/40" />
      <div className="relative w-full max-w-md bg-chalk p-7 shadow-2xl sm:p-9">
        <Mark name="sun" className="h-7 w-7 text-blue" />
        <h2 className="display mt-5 text-[1.8rem]">Join the waitlist</h2>
        <p className="mt-2 text-[0.88rem] text-ink-soft">
          {session.title} · {fmtDate(session.localDate, "EEEE d MMMM")} · {fmtTime(session.startsAt)}. If a spot opens, we’ll hold it for you and send a link to accept. Nothing is charged until you accept.
        </p>
        {msg?.ok ? (
          <p className="mt-6 border-l-2 border-blue pl-4 text-[0.92rem]">{msg.text}</p>
        ) : (
          <div className="mt-6 space-y-5">
            {!guardian ? (
              <div className="grid gap-5 sm:grid-cols-2">
                {(["firstName", "lastName", "email"] as const).map((k) => (
                  <label key={k} className={`block ${k === "email" ? "sm:col-span-2" : ""}`}>
                    <span className="text-[0.7rem] tracking-[0.16em] text-ink-soft uppercase">{k === "firstName" ? "Your first name" : k === "lastName" ? "Last name" : "Email"}</span>
                    <input type={k === "email" ? "email" : "text"} value={adult[k]} onChange={(e) => setAdult((a) => ({ ...a, [k]: e.target.value }))} className={input} />
                  </label>
                ))}
              </div>
            ) : null}
            {savedChildren.length ? (
              <label className="block">
                <span className="text-[0.7rem] tracking-[0.16em] text-ink-soft uppercase">Child</span>
                <select value={childId} onChange={(e) => setChildId(e.target.value)} className={input}>
                  {savedChildren.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.preferredName || c.firstName}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[0.7rem] tracking-[0.16em] text-ink-soft uppercase">Child’s first name</span>
                  <input value={child.firstName} onChange={(e) => setChild((c) => ({ ...c, firstName: e.target.value }))} className={input} />
                </label>
                <label className="block">
                  <span className="text-[0.7rem] tracking-[0.16em] text-ink-soft uppercase">Date of birth</span>
                  <input type="date" value={child.birthDate} onChange={(e) => setChild((c) => ({ ...c, birthDate: e.target.value }))} className={input} />
                </label>
              </div>
            )}
            {msg && !msg.ok ? (
              <p role="alert" className="text-[0.85rem] text-oxblood">
                {msg.text}
                {msg.devLink ? (
                  <a href={msg.devLink} className="ml-1 underline">
                    (local preview sign-in link)
                  </a>
                ) : null}
              </p>
            ) : null}
            <button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await joinWaitlistAction({ sessionId: session.id, guardian: adult, child: savedChildren.length ? { existingId: childId, firstName: "", birthDate: "" } : child });
                  setMsg(res.ok ? { ok: true, text: "You’re on the waitlist. We’ll email you if a spot opens." } : { ok: false, text: res.error, devLink: "devLink" in res ? res.devLink : undefined });
                })
              }
              className="h-12 w-full rounded-full bg-ink text-[0.9rem] text-chalk transition-colors hover:bg-blue disabled:opacity-40"
            >
              {pending ? "Adding you…" : "Join the waitlist"}
            </button>
          </div>
        )}
        <button onClick={onClose} className="mt-4 w-full text-[0.85rem] text-ink-soft hover:text-ink">
          Close
        </button>
      </div>
    </div>
  );
}

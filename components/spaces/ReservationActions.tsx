"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancel, resumeCheckout } from "@/app/(site)/portal/spaces/actions";

/** Cancel / change / calendar actions for one of the family's reservations. */
export function ReservationActions({ reference, canCancel, canMove, confirmed, held }: { reference: string; canCancel: boolean; canMove: boolean; confirmed: boolean; held: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const doCancel = () =>
    start(async () => {
      const r = await cancel(reference);
      if (!r.ok) return setMessage({ ok: false, text: r.error });
      setMessage({ ok: true, text: "Your reservation has been cancelled, and the space is available again." });
      setConfirming(false);
      router.refresh();
    });
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-[0.85rem]">
        {held ? <ResumeCheckout reference={reference} compact /> : null}
        {confirmed ? (
          <a href={`/portal/spaces/ics/${reference}`} className="text-blue underline-offset-4 hover:underline">
            Add to calendar
          </a>
        ) : null}
        {canMove ? (
          <Link href={`/portal/spaces?move=${reference}`} className="underline-offset-4 hover:underline">
            Change time
          </Link>
        ) : null}
        {(canCancel || held) && !confirming ? (
          <button onClick={() => setConfirming(true)} className="text-ink-soft underline-offset-4 hover:text-ink hover:underline">
            {held ? "Let it go" : "Cancel"}
          </button>
        ) : null}
      </div>
      {confirming ? (
        <div role="alertdialog" aria-label="Cancel this reservation?" className="flex flex-wrap items-center gap-3 text-[0.85rem]">
          <span>{held ? "Release this held time?" : "Cancel this reservation?"}</span>
          <button onClick={doCancel} disabled={pending} className="h-9 rounded-full bg-ink px-4 text-chalk hover:bg-blue disabled:opacity-40">
            {pending ? "One moment…" : held ? "Yes, release it" : "Yes, cancel"}
          </button>
          <button onClick={() => setConfirming(false)} className="text-ink-soft underline-offset-4 hover:underline">
            Keep it
          </button>
        </div>
      ) : null}
      {message ? (
        <p role="status" className={`text-[0.82rem] ${message.ok ? "text-ink-soft" : "text-oxblood"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

export function ResumeCheckout({ reference, compact }: { reference: string; compact?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        onClick={() =>
          start(async () => {
            const r = await resumeCheckout(reference);
            if (!r.ok) return setError(r.error);
            window.location.assign(r.data.url);
          })
        }
        disabled={pending}
        className={compact ? "text-blue underline-offset-4 hover:underline" : "inline-flex h-12 items-center rounded-full bg-blue px-6 text-[0.9rem] text-chalk hover:bg-ink disabled:opacity-40"}
      >
        {pending ? "One moment…" : "Finish payment"}
      </button>
      {error ? <span className="text-[0.82rem] text-oxblood">{error}</span> : null}
    </>
  );
}

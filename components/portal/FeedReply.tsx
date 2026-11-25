"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { feedReplyAction } from "@/app/(site)/portal/actions";

function Send() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="h-10 shrink-0 rounded-full bg-ink px-5 text-[0.85rem] text-chalk transition-colors hover:bg-blue disabled:opacity-40">
      {pending ? "Sending…" : "Send"}
    </button>
  );
}

/** A parent's reply to the team, under their child's day. */
export function FeedReply({ childId, childName }: { childId: string; childName: string }) {
  const [state, action] = useActionState(feedReplyAction, undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} className="mt-5">
      <input type="hidden" name="childId" value={childId} />
      <label className="block">
        <span className="sr-only">Message the team about {childName}</span>
        <div className="flex items-end gap-2">
          <textarea name="body" rows={1} required maxLength={2000} placeholder={`Message the team about ${childName}…`} className="min-h-10 w-full resize-y border-0 border-b border-ink/20 bg-transparent px-0 py-2 text-[0.95rem] focus:border-blue focus:ring-0 focus:outline-none" />
          <Send />
        </div>
      </label>
      {state?.error ? (
        <p role="alert" className="mt-2 text-[0.82rem] text-oxblood">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

/** Keeps today's feed fresh while the page is open (every minute, only when the tab is visible). */
export function FeedRefresh() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 60_000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}

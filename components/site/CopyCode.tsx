"use client";

import { useEffect, useState } from "react";
import { saveCoupon } from "@/lib/booking/saved-coupon";

/** The code, large, with a one-tap copy button. Visiting also saves it for checkout. */
export function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => saveCoupon(code), [code]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Older browsers: select the code so a long-press copies it.
      const el = document.getElementById("coupon-code");
      if (el) window.getSelection()?.selectAllChildren(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }
  return (
    <div className="mx-auto max-w-md border-2 border-dashed border-blue bg-mist px-6 py-8 text-center">
      <p className="eyebrow text-[0.62rem] text-ink-soft">Your code</p>
      <p id="coupon-code" className="mt-3 font-mono text-[2rem] font-bold tracking-[0.12em] text-ink select-all">
        {code}
      </p>
      <button type="button" onClick={copy} className="mt-6 inline-flex h-12 items-center rounded-full bg-blue px-8 text-[0.95rem] text-chalk transition-colors hover:bg-blue-deep">
        {copied ? "Copied!" : "Copy code"}
      </button>
      <p className="mt-3 text-[0.8rem] text-ink-soft" aria-live="polite">
        {copied ? "Paste it into “Coupon code” at checkout." : "It’s also saved on this device, so checkout applies it for you."}
      </p>
    </div>
  );
}

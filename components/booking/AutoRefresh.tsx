"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/** Re-reads the server-rendered page while a payment is being confirmed. */
export function AutoRefresh({ seconds, maxTries }: { seconds: number; maxTries: number }) {
  const router = useRouter();
  const tries = useRef(0);
  useEffect(() => {
    const t = setInterval(() => {
      tries.current++;
      if (tries.current > maxTries) return clearInterval(t);
      router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds, maxTries]);
  return null;
}

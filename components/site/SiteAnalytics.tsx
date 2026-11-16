"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

/** Pages with personal information (or private links) are never measured. */
const PRIVATE = /^\/(admin|portal|pay|book\/confirmation|book\/offer)(\/|$)/;

/** Drops private pages and strips query strings and fragments (which can carry link keys). */
function clean<T extends { url: string }>(event: T): T | null {
  try {
    const u = new URL(event.url);
    if (PRIVATE.test(u.pathname)) return null;
    return { ...event, url: `${u.origin}${u.pathname}` };
  } catch {
    return null;
  }
}

/** Vercel Web Analytics (cookieless page views) and Speed Insights, for public pages only. */
export function SiteAnalytics() {
  return (
    <>
      <Analytics beforeSend={clean} />
      <SpeedInsights beforeSend={clean} />
    </>
  );
}

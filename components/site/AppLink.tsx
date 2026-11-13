"use client";

import { useEffect, useState } from "react";

type App = { name: string; web: string; ios?: string; android?: string };

/**
 * A link to a parking app: the App Store on iPhone and iPad, Google Play on Android (both open the
 * store app directly), and the app's website everywhere else.
 */
export function AppLink({ app }: { app: App }) {
  const [href, setHref] = useState(app.web);
  useEffect(() => {
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
    if (ios && app.ios) setHref(app.ios);
    else if (/Android/.test(ua) && app.android) setHref(app.android);
  }, [app]);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-4 py-1.5 text-[0.9rem] text-ink transition-colors hover:border-ink hover:text-blue"
    >
      {app.name}
      <span aria-hidden className="text-[0.75rem]">↗</span>
    </a>
  );
}

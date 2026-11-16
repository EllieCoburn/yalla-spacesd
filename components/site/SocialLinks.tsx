import { site } from "@/content/site";

const TONES = {
  /** On the site's cream background (header and menu). */
  light:
    "flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 text-ink/70 transition-all duration-300 hover:-translate-y-0.5 hover:border-blue hover:bg-blue hover:text-chalk focus-visible:ring-2 focus-visible:ring-blue/50 focus-visible:outline-none",
  /** On Yalla Blue. */
  dark: "flex h-10 w-10 items-center justify-center rounded-full border border-chalk/30 text-chalk/85 transition-all duration-300 hover:-translate-y-0.5 hover:border-chalk hover:bg-chalk hover:text-blue focus-visible:ring-2 focus-visible:ring-chalk/60 focus-visible:outline-none",
};

/** Yalla's Instagram, Pinterest and Amazon storefront. */
export function SocialLinks({ tone = "light", className = "" }: { tone?: keyof typeof TONES; className?: string }) {
  const cls = TONES[tone];
  return (
    <ul className={`flex gap-2 ${className}`}>
      <li>
        <a href={site.instagram.value} target="_blank" rel="noopener noreferrer" aria-label="Yalla on Instagram" className={cls}>
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" stroke="none" />
          </svg>
        </a>
      </li>
      <li>
        <a href={site.pinterest.value} target="_blank" rel="noopener noreferrer" aria-label="Yalla on Pinterest" className={cls}>
          <svg viewBox="0 0 24 24" className="h-[19px] w-[19px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9.6 21.5 12.2 11" />
            <path d="M10.6 15.6c.6.9 1.6 1.4 2.8 1.4 2.9 0 4.9-2.5 4.9-5.6 0-3.2-2.5-5.7-6-5.7-3.6 0-6 2.5-6 5.5 0 1.3.5 2.4 1.4 3" />
          </svg>
        </a>
      </li>
      <li>
        <a href={site.amazon.value} target="_blank" rel="noopener noreferrer" aria-label="Yalla’s Amazon storefront" className={cls}>
          <svg viewBox="0 0 24 24" className="h-[19px] w-[19px]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5.5 8h13l-1 12.5h-11z" />
            <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
            <path d="M8.3 14c2.3 1.5 5.1 1.5 7.4 0" />
            <path d="M14.6 13.2l1.3.7-.4 1.4" />
          </svg>
        </a>
      </li>
    </ul>
  );
}

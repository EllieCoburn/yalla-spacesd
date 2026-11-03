import Link from "next/link";
import { Mark } from "@/components/brand/Mark";
import { WindowField } from "@/components/brand/WindowField";
import { ToConfirm } from "@/components/ui/Draft";
import { nav, site } from "@/content/site";
import { TEAM_PUBLIC } from "@/content/team";

const social =
  "flex h-10 w-10 items-center justify-center rounded-full border border-chalk/30 text-chalk/85 transition-all duration-300 hover:-translate-y-0.5 hover:border-chalk hover:bg-chalk hover:text-blue focus-visible:ring-2 focus-visible:ring-chalk/60 focus-visible:outline-none";

export function SiteFooter() {
  return (
    <footer className="roofline-edge mt-0 bg-blue text-blue">
      <div className="text-chalk">
        <div className="shell grid gap-14 pt-20 pb-16 lg:grid-cols-12 lg:pt-28">
          <div className="lg:col-span-5">
            <Mark name="mark" title="Yalla" className="h-40 w-auto text-chalk lg:h-52" />
            <p className="display mt-10 max-w-sm text-[1.9rem] lg:text-[2.3rem]">
              Close to your child. <em className="text-mist!">Connected to your day.</em>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 text-[0.95rem] sm:grid-cols-3 lg:col-span-7 lg:pt-4">
            <div>
              <p className="eyebrow mb-5 text-chalk/60">Discover</p>
              <ul className="space-y-2.5">
                {nav.map((n) => (
                  <li key={n.href}>
                    <Link href={n.href} className="link-underline text-chalk/90 hover:text-chalk">
                      {n.short}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href="/approach" className="link-underline text-chalk/90 hover:text-chalk">
                    Our approach
                  </Link>
                </li>
                {TEAM_PUBLIC ? (
                  <li>
                    <Link href="/about/team" className="link-underline text-chalk/90 hover:text-chalk">
                      Our team
                    </Link>
                  </li>
                ) : null}
                <li>
                  <Link href="/faq" className="link-underline text-chalk/90 hover:text-chalk">
                    FAQ
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="eyebrow mb-5 text-chalk/60">Families</p>
              <ul className="space-y-2.5">
                <li>
                  <Link href="/book" className="link-underline">Book care</Link>
                </li>
                <li>
                  <Link href="/visit" className="link-underline">Book a tour</Link>
                </li>
                <li>
                  <Link href="/belonging" className="link-underline">Belonging at Yalla</Link>
                </li>
                <li>
                  <Link href="/portal" className="link-underline">Family Portal</Link>
                </li>
              </ul>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="eyebrow mb-5 text-chalk/60">Find us</p>
              <p className="text-chalk/90">
                {site.address.value}
              </p>
              <p className="mt-4 text-chalk/90">
                Weekday cohorts 8:30am – 4:30pm
                <br />
                Weekend, evening & camp times vary
              </p>
              <p className="mt-4">
                <a href={`mailto:${site.email.value}`} className="link-underline">
                  {site.email.value}
                </a>
                {site.email.confirm ? <ToConfirm /> : null}
              </p>
            </div>
          </div>
        </div>

        <div className="shell">
          <div className="flex flex-col gap-4 border-t border-chalk/20 py-7 text-[0.78rem] text-chalk/60 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} {site.fullName}.</p>
            <ul className="flex gap-3">
              <li>
                <a href={site.instagram.value} target="_blank" rel="noopener noreferrer" aria-label="Yalla on Instagram" className={social}>
                  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
                    <circle cx="12" cy="12" r="4" />
                    <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" stroke="none" />
                  </svg>
                </a>
              </li>
              <li>
                <a href={site.pinterest.value} target="_blank" rel="noopener noreferrer" aria-label="Yalla on Pinterest" className={social}>
                  <svg viewBox="0 0 24 24" className="h-[19px] w-[19px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M9.6 21.5 12.2 11" />
                    <path d="M10.6 15.6c.6.9 1.6 1.4 2.8 1.4 2.9 0 4.9-2.5 4.9-5.6 0-3.2-2.5-5.7-6-5.7-3.6 0-6 2.5-6 5.5 0 1.3.5 2.4 1.4 3" />
                  </svg>
                </a>
              </li>
            </ul>
          </div>
        </div>
        <WindowField seed={11} height={150} className="block h-24 w-full lg:h-32" pane="var(--color-blue-deep)" ground="var(--color-blue)" />
      </div>
    </footer>
  );
}

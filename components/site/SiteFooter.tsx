import Link from "next/link";
import { Mark } from "@/components/brand/Mark";
import { WindowField } from "@/components/brand/WindowField";
import { nav, site } from "@/content/site";
import { TEAM_PUBLIC } from "@/content/team";

export function SiteFooter() {
  return (
    <footer className="roofline-edge mt-0 bg-blue text-blue">
      <div className="text-chalk">
        <div className="shell grid gap-14 pt-20 pb-16 lg:grid-cols-12 lg:pt-28">
          <div className="lg:col-span-5">
            <Mark name="mark" title="Yalla" className="h-40 w-auto text-chalk lg:h-52" />
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
                <li>
                  <Link href="/policies" className="link-underline text-chalk/90 hover:text-chalk">
                    Policies &amp; Terms
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
                  <Link href="/belonging" className="link-underline">Belonging at Yalla</Link>
                </li>
                <li>
                  <Link href="/portal" className="link-underline">Family Portal</Link>
                </li>
              </ul>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="eyebrow mb-5 text-chalk/60">Visit &amp; connect</p>
              <p className="text-chalk/90">
                408 Nutmeg Street
                <br />
                San Diego, CA 92103
              </p>
              <p className="mt-4 font-semibold text-chalk">Visits by appointment or reservation only</p>
              <p className="mt-4">
                <a href="tel:+16197754008" className="link-underline">
                  619.775.4008
                </a>
              </p>
              <p className="mt-4">
                <Link href="/book-a-tour" className="link-underline">
                  Book a tour
                </Link>
              </p>
            </div>
          </div>
        </div>

        <div className="shell">
          <div className="flex flex-col gap-4 border-t border-chalk/20 py-7 text-[0.78rem] text-chalk/60 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} {site.fullName}.</p>
          </div>
        </div>
        <WindowField seed={11} height={150} className="block h-24 w-full lg:h-32" pane="var(--color-blue-deep)" ground="var(--color-blue)" />
      </div>
    </footer>
  );
}

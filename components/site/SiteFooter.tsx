import Link from "next/link";
import { Mark } from "@/components/brand/Mark";
import { WindowField } from "@/components/brand/WindowField";
import { ToConfirm } from "@/components/ui/Draft";
import { nav, site } from "@/content/site";

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
                  <Link href="/about/team" className="link-underline text-chalk/90 hover:text-chalk">
                    Our team
                  </Link>
                </li>
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
                  <Link href="/visit" className="link-underline">Schedule a tour</Link>
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
                <br />
                {site.neighborhood}, near Balboa Park’s west entrance
              </p>
              <p className="mt-4 text-chalk/90">
                Weekday classrooms 8:30am – 4:30pm
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
            <p>© {new Date().getFullYear()} {site.fullName}. Bankers Hill, San Diego.</p>
            <p className="flex gap-6">
              <a href={site.instagram.value} target="_blank" rel="noopener noreferrer" className="link-underline hover:text-chalk">
                Instagram
              </a>
              <a href={site.pinterest.value} target="_blank" rel="noopener noreferrer" className="link-underline hover:text-chalk">
                Pinterest
              </a>
            </p>
          </div>
        </div>
        <WindowField seed={11} height={150} className="block h-24 w-full lg:h-32" pane="var(--color-blue-deep)" ground="var(--color-blue)" />
      </div>
    </footer>
  );
}

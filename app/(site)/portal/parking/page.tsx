import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Mark } from "@/components/brand/Mark";
import { isDbConfigured } from "@/lib/db";
import { balboaLots, balboaPassesHref, monthlyLots, parkingAddress, parkingApps, parkingIntro, parkingOptions, parkSmarterHref } from "@/content/parking";
import { getGuardian } from "../session";

export const metadata: Metadata = { title: "Parking guide", robots: { index: false } };
export const dynamic = "force-dynamic";

const ext = "underline decoration-blue/40 underline-offset-4 hover:text-blue hover:decoration-blue";

function Option({ id, n, title, price, children }: { id: string; n: number; title: string; price: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 border-t border-line pt-10 lg:grid lg:grid-cols-12 lg:gap-10">
      <div className="lg:col-span-4">
        <p className="font-serif text-ink-soft italic">0{n}</p>
        <h2 className="display mt-2 text-[clamp(1.8rem,1.4rem+1.2vw,2.4rem)]">{title}</h2>
        <p className="mt-3 inline-flex rounded-full bg-mist px-3 py-1 text-[0.82rem] text-blue">{price}</p>
      </div>
      <div className="mt-6 space-y-5 text-[1.02rem] text-ink-soft lg:col-span-8 lg:mt-0">{children}</div>
    </section>
  );
}

function Rows({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-line border-y border-line">
      {rows.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-6 py-3">
          <dt className="text-ink">{r.label}</dt>
          <dd className="text-right text-[0.92rem]">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="border-l-2 border-blue/40 pl-4 font-serif text-[1rem] text-ink italic">{children}</p>;
}

export default async function ParkingGuide() {
  // Families only: the guide is part of the Family Portal.
  if (!isDbConfigured() || !(await getGuardian())) redirect("/portal?next=/portal/parking");

  return (
    <div className="pt-28 pb-24 lg:pt-36">
      <div className="shell">
        <Link href="/portal/home" className="text-[0.85rem] text-ink-soft underline-offset-4 hover:text-ink hover:underline">
          ← Family Portal
        </Link>

        <div className="mt-8 grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <p className="eyebrow text-ink-soft">Family Portal · Parking</p>
            <h1 className="display mt-5 text-[clamp(2.4rem,1.8rem+2.4vw,4rem)]">
              Parking guide for <em>Yalla families.</em>
            </h1>
            <p className="mt-6 max-w-xl text-[1.05rem] text-ink-soft">{parkingIntro}</p>
            <p className="mt-6 text-[0.95rem]">
              <span className="eyebrow mr-3 text-[0.6rem] text-ink-soft">Address</span>
              {parkingAddress}
            </p>
          </div>
          <nav aria-label="Parking options" className="lg:col-span-4 lg:col-start-9">
            <p className="eyebrow text-[0.6rem] text-ink-soft">At a glance</p>
            <ol className="mt-3 divide-y divide-line border-y border-line">
              {parkingOptions.map((o, i) => (
                <li key={o.id}>
                  <a href={`#${o.id}`} className="flex items-baseline justify-between gap-4 py-3 hover:text-blue">
                    <span>
                      <span className="mr-3 font-serif text-ink-soft italic">0{i + 1}</span>
                      {o.title}
                    </span>
                    <span className="text-right text-[0.8rem] text-ink-soft">{o.price}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </div>

        <div className="mt-20 space-y-16">
          <Option id="park-and-walk" n={1} title="Park and walk" price="Free with tuition">
            <p>Balboa Park offers free resident parking in select lots for residents of San Diego.</p>
            <p>
              Balboa Park also offers a select number of parking lots that require a paid parking pass.{" "}
              <strong className="font-medium text-ink">Paid Balboa Park parking will end by January 1, 2027.</strong>
            </p>
            <p>
              If you’d like to park in a paid lot, Yalla offers{" "}
              <a href={balboaPassesHref} target="_blank" rel="noreferrer" className={ext}>
                monthly parking passes
              </a>{" "}
              for San Diego residents that allow all-day parking in multiple Balboa Park lots.
            </p>
            <p>
              For families who choose to use this option, Yalla includes a monthly Balboa Park resident parking pass{" "}
              <span className="text-ink">at no additional cost as part of tuition</span>. Families using this amenity may park in any eligible Balboa Park lot,
              display the Yalla-provided resident parking pass, and walk to Yalla.
            </p>
            <p>Families who pay daily parking rates in any Balboa Park lot are eligible for same-day reimbursement upon submission of a valid parking receipt.</p>

            <ul className="grid gap-3 pt-2 sm:grid-cols-2">
              {balboaLots.map((l) => (
                <li key={l.name} className="border border-line bg-paper p-5">
                  <p className="display text-[1.2rem] text-ink">{l.name}</p>
                  <p className={`mt-2 text-[0.85rem] ${l.free ? "text-blue" : "text-ink-soft"}`}>{l.free ? "Free for residents" : "Parking pass needed"}</p>
                  <p className="mt-1 text-[0.85rem]">{l.walk}</p>
                  <a href={l.href} target="_blank" rel="noreferrer" className={`mt-3 inline-block text-[0.82rem] ${ext}`}>
                    Walking directions
                  </a>
                </li>
              ))}
            </ul>
            <Note>Ideal for families who enjoy a walk through the park to start and end their day, and families looking for a cost-effective parking option.</Note>
          </Option>

          <Option id="metered" n={2} title="Paid metered parking" price="$5 for 2 hours">
            <Rows
              rows={[
                { label: "Where", value: "Nutmeg St and all surrounding blocks" },
                { label: "Cost", value: "$5 for 2 hours · 4 hours max" },
                {
                  label: "Payment",
                  value: (
                    <>
                      Quarters, Tap to Pay (Apple Pay, etc.) or the{" "}
                      <a href={parkSmarterHref} target="_blank" rel="noreferrer" className={ext}>
                        Park Smarter app
                      </a>
                    </>
                  ),
                },
              ]}
            />
            <p>Ideal for short visits, arrivals and departures, part-time families or half-day coworking sessions.</p>
            <Note>
              Even if a parking meter appears broken or turned off, payment is still required to avoid a citation. To pay, download the City of San Diego’s{" "}
              <a href={parkSmarterHref} target="_blank" rel="noreferrer" className={ext}>
                Park Smarter app
              </a>{" "}
              and follow the prompts to create an account. Initial setup typically takes 5–7 minutes; after that, the app is quick and easy to use.
            </Note>
          </Option>

          <Option id="monthly" n={3} title="Discounted monthly lots" price="$90 a month">
            <p>We partner with two nearby lots for families who need consistent parking. Yalla subsidizes $50 per month per spot, reducing your monthly cost to $90.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {monthlyLots.map((l, i) => (
                <div key={l.name} className="border border-line bg-paper p-6">
                  <p className="eyebrow text-[0.58rem] text-ink-soft">
                    Lot {i + 1} · {l.walk}
                  </p>
                  <p className="display mt-2 text-[1.35rem] text-ink">{l.name}</p>
                  <p className="mt-1 text-[0.88rem]">{l.address}</p>
                  <dl className="mt-4 divide-y divide-line border-t border-line text-[0.88rem]">
                    <div className="flex justify-between gap-4 py-2">
                      <dt>Regular rate</dt>
                      <dd className="line-through decoration-ink-soft/60">$160 / month</dd>
                    </div>
                    <div className="flex justify-between gap-4 py-2">
                      <dt className="text-ink">Yalla rate</dt>
                      <dd className="text-blue">$90 / month</dd>
                    </div>
                    <div className="flex justify-between gap-4 py-2">
                      <dt>Billed</dt>
                      <dd className="text-right">{l.billed}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
            <Note>
              Contact the Yalla team at{" "}
              <a href="mailto:hello@yallaspacesd.com" className={ext}>
                hello@yallaspacesd.com
              </a>{" "}
              if you’d like to secure a monthly spot.
            </Note>
          </Option>

          <Option id="apps" n={4} title="App-based parking" price="Cost varies">
            <p>We encourage families who want to park in a nearby paid lot to use parking apps to save money and time:</p>
            <ul className="flex flex-wrap gap-2">
              {parkingApps.map((a) => (
                <li key={a} className="rounded-full border border-ink/15 px-4 py-1.5 text-[0.9rem] text-ink">
                  {a}
                </li>
              ))}
            </ul>
            <p>These apps let you compare prices of nearby lots, reserve and pay online before arriving, and avoid circling for an open spot.</p>
          </Option>

          <Option id="driveway" n={5} title="Yalla driveway policy" price="Reserved">
            <p>Yalla has a four-slot driveway.</p>
            <ul className="space-y-3">
              {[
                "All spaces are reserved for staff and program use. Even if they are vacant, they are not available.",
                "Families without special permission or arrangement may not park in the driveway, even temporarily.",
                "The driveway is not a loading zone unless prearranged with program management.",
                "Do not block the driveway at any time, even for a quick arrival or departure.",
              ].map((x) => (
                <li key={x} className="flex items-start gap-4">
                  <Mark name="sun" className="mt-1.5 h-3 w-3 shrink-0 text-blue" />
                  <span className="text-ink">{x}</span>
                </li>
              ))}
            </ul>
            <Note>This policy ensures safety, compliance and smooth traffic flow for our community.</Note>
          </Option>
        </div>
      </div>
    </div>
  );
}

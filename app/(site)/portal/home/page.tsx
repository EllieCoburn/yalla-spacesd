import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Mark } from "@/components/brand/Mark";
import { PortalDashboard } from "@/components/portal/PortalDashboard";
import { CancelForm, CareForm, SignForm } from "@/components/portal/PortalForms";
import { getDb, isDbConfigured } from "@/lib/db";
import { familyPortalData } from "@/lib/ops/public-booking";
import { PORTAL_OPEN_PREVIEW, previewGuardian, samplePortalData } from "@/lib/portal-preview";
import { ageLabel, fmtDate, fmtTime, todayLA } from "@/lib/time";
import { signOutAction } from "../actions";
import { getGuardian } from "../session";

export const metadata: Metadata = { title: "Family Portal", robots: { index: false } };
export const dynamic = "force-dynamic";

const usd = (c: number) => `${c < 0 ? "−" : ""}$${(Math.abs(c) / 100).toFixed(2)}`;
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STATE_LABEL: Record<string, string> = { complete: "Complete", missing: "Needed", unsigned: "Needs signature", expired: "Expired — please renew", needs_resign: "Updated — please sign again" };

export default async function PortalHome({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const g = isDbConfigured() ? await getGuardian() : null;
  if (!g && !PORTAL_OPEN_PREVIEW) {
    // Without a database this deployment can only show the illustrative preview.
    if (!isDbConfigured()) return <PortalDashboard />;
    redirect("/portal");
  }
  // Open preview: no one is signed in, so show a made-up sample family instead of real records.
  const preview = !g;
  const who = g ?? previewGuardian;
  const { tab = "overview" } = await searchParams;
  const data = g ? await familyPortalData(getDb(), g) : samplePortalData();
  const outstanding = data.forms.filter((f) => f.state !== "complete");
  const today = todayLA();
  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "children", label: "Children" },
    { key: "bookings", label: "Bookings" },
    { key: "forms", label: "Forms", count: outstanding.length },
    ...(data.billing ? [{ key: "payments", label: "Payments" }] : []),
    { key: "parking", label: "Parking", href: "/portal/parking" },
  ];

  const bookingList = (items: typeof data.upcoming, cancellable: boolean) =>
    items.length === 0 ? (
      <p className="mt-6 text-ink-soft">Nothing here yet.</p>
    ) : (
      <ul className="mt-6 divide-y divide-line">
        {items.map((b) => (
          <li key={b.itemId} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-4 py-4">
            <span className="text-center leading-none">
              <span className="eyebrow block text-[0.55rem] text-ink-soft">{fmtDate(b.localDate, "MMM")}</span>
              <span className="display mt-1 block text-[1.8rem]">{fmtDate(b.localDate, "d")}</span>
            </span>
            <span>
              <span className="block">{b.title}</span>
              <span className="text-[0.8rem] text-ink-soft">
                {b.child ? `${b.child} · ` : ""}
                {fmtDate(b.localDate, "EEE")} {fmtTime(b.startsAt)} – {fmtTime(b.endsAt)} · {b.reference}
              </span>
              {cancellable && b.itemStatus === "confirmed" ? <span className="block text-[0.75rem] text-ink-soft">{b.cancelNote}</span> : null}
            </span>
            {b.itemStatus === "cancelled" ? (
              <span className="eyebrow text-[0.55rem] text-ink-soft">Cancelled</span>
            ) : cancellable && b.canCancel ? (
              <CancelForm itemId={b.itemId} label={`${b.title} on ${fmtDate(b.localDate)}`} />
            ) : (
              <span className="eyebrow text-[0.55rem] text-ink-soft">{b.bookingStatus === "confirmed" ? "Confirmed" : b.bookingStatus === "requested" ? "Awaiting approval" : b.bookingStatus.replace("_", " ")}</span>
            )}
          </li>
        ))}
      </ul>
    );

  return (
    <div className="pt-28 pb-24 lg:pt-36">
      <div className="shell">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="eyebrow text-ink-soft">Family Portal · {data.children.length ? who.familyName : ""}</p>
            <h1 className="display mt-5 text-[clamp(2.4rem,1.8rem+2.4vw,4rem)]">
              Good to see you, <em>{who.firstName}.</em>
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/book" className="inline-flex h-11 items-center rounded-full bg-ink px-6 text-[0.88rem] text-chalk hover:bg-blue">
              Book care
            </Link>
            {preview ? (
              <Link href="/portal?signin=1" className="text-[0.85rem] text-ink-soft underline-offset-4 hover:text-ink hover:underline">
                Sign in
              </Link>
            ) : (
              <form action={signOutAction}>
                <button className="text-[0.85rem] text-ink-soft underline-offset-4 hover:text-ink hover:underline">Sign out</button>
              </form>
            )}
          </div>
        </div>

        {preview ? (
          <p className="mt-8 max-w-2xl border-l-2 border-oxblood/40 pl-4 text-[0.82rem] text-oxblood">
            Preview with a made-up sample family, open to anyone while the portal is being built. Buttons here don’t change anything. Families who sign in see only their own details.
          </p>
        ) : null}

        <nav aria-label="Portal sections" className="no-scrollbar -mx-[clamp(1.25rem,4vw,3.5rem)] mt-10 flex gap-8 overflow-x-auto border-b border-line px-[clamp(1.25rem,4vw,3.5rem)] md:mx-0 md:px-0">
          {tabs.map((t) => (
            <Link key={t.key} href={"href" in t && t.href ? t.href : `/portal/home?tab=${t.key}`} aria-current={tab === t.key ? "page" : undefined} className={`relative shrink-0 pb-4 text-[0.92rem] ${tab === t.key ? "text-ink" : "text-ink-soft hover:text-ink"}`}>
              {t.label}
              {"count" in t && t.count ? <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-oxblood px-1.5 text-[0.65rem] text-chalk">{t.count}</span> : null}
              {tab === t.key ? <span className="absolute inset-x-0 -bottom-px h-[2px] bg-blue" /> : null}
            </Link>
          ))}
        </nav>

        <div className="mt-10">
          {tab === "overview" ? (
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="border border-line bg-paper p-7 lg:col-span-2">
                <div className="flex items-center justify-between">
                  <p className="display text-[1.6rem]">Coming up</p>
                  <Link href="/portal/home?tab=bookings" className="text-[0.85rem] text-blue underline-offset-4 hover:underline">
                    All bookings
                  </Link>
                </div>
                {bookingList(data.upcoming.slice(0, 4), false)}
                {data.memberships.length ? (
                  <div className="mt-6 border-t border-line pt-5">
                    <p className="eyebrow text-[0.6rem] text-ink-soft">Club Yalla</p>
                    <ul className="mt-2 space-y-1 text-[0.92rem]">
                      {data.memberships.map((m) => (
                        <li key={m.id}>
                          {m.child}: {m.weekdays.map((d) => WEEKDAY[d]).join(", ")} · {m.dayLength === "half" ? "half days" : "full days"}
                          {m.status === "upcoming" ? ` · starts ${fmtDate(m.startsOn)}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
              <div className="flex flex-col gap-6">
                <div className={`p-7 ${outstanding.length ? "bg-blue text-chalk" : "border border-line bg-paper"}`}>
                  <Mark name="dotsun" className="h-10 w-auto" />
                  <p className="display mt-6 text-[1.5rem]">{outstanding.length ? `${outstanding.length} form${outstanding.length === 1 ? "" : "s"} need attention` : "Paperwork is complete"}</p>
                  {outstanding.length ? (
                    <Link href="/portal/home?tab=forms" className="mt-5 inline-block text-[0.85rem] underline underline-offset-4">
                      Review forms
                    </Link>
                  ) : null}
                </div>
                <Link href="/portal/parking" className="group border border-line bg-paper p-7 transition-colors hover:border-ink/40">
                  <p className="eyebrow text-[0.6rem] text-ink-soft">Getting here</p>
                  <p className="display mt-3 text-[1.4rem]">Parking guide</p>
                  <p className="mt-2 text-[0.88rem] text-ink-soft">Free park-and-walk lots, meters, discounted monthly spots and our driveway policy.</p>
                  <span className="mt-4 inline-block text-[0.85rem] text-blue underline-offset-4 group-hover:underline">Read the guide</span>
                </Link>
                <div className="border border-line bg-paper p-7">
                  <p className="eyebrow text-[0.6rem] text-ink-soft">Your children</p>
                  <ul className="mt-4 space-y-3">
                    {data.children.map((c) => (
                      <li key={c.id} className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-t-full bg-mist font-serif text-blue">{(c.preferredName || c.firstName)[0]}</span>
                        <span>
                          <span className="block">{c.preferredName || c.firstName}</span>
                          <span className="text-[0.8rem] text-ink-soft">
                            {ageLabel(c.birthDate, today)}
                            {c.cohort ? ` · ${c.cohort}` : ""}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : tab === "children" ? (
            <div className="grid gap-6 md:grid-cols-2">
              {data.children.map((c) => (
                <div key={c.id} className="border border-line bg-paper p-7">
                  <p className="display text-[1.7rem]">
                    {c.preferredName || c.firstName} {c.lastName}
                  </p>
                  <p className="mt-1 text-[0.88rem] text-ink-soft">
                    Born {fmtDate(c.birthDate, "d MMMM yyyy")} · {ageLabel(c.birthDate, today)}
                    {c.cohort ? ` · ${c.cohort}` : ""}
                  </p>
                  {c.care ? (
                    <>
                      <CareForm childId={c.id} care={c.care} />
                      {c.care.updatedAt ? <p className="mt-3 text-[0.75rem] text-ink-soft">Last updated {new Date(c.care.updatedAt).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium" })}</p> : null}
                    </>
                  ) : (
                    <p className="mt-5 text-[0.85rem] text-ink-soft">Care and medical details are visible to guardians with access to them. Ask your family’s primary guardian.</p>
                  )}
                </div>
              ))}
              <div className="flex min-h-48 flex-col items-center justify-center border border-dashed border-ink/25 p-7 text-center text-[0.9rem] text-ink-soft">
                Adding a child? Include them in your next booking, or let Yalla know.
              </div>
            </div>
          ) : tab === "bookings" ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="border border-line bg-paper p-7">
                <p className="display text-[1.6rem]">Upcoming</p>
                {bookingList(data.upcoming, true)}
                <p className="mt-6 text-[0.78rem] text-ink-soft">Cancelling never issues a refund automatically; Yalla confirms any refund or credit. Club Yalla days are managed with the Yalla team.</p>
              </div>
              <div className="border border-line bg-paper p-7">
                <p className="display text-[1.6rem]">Past & cancelled</p>
                {bookingList(data.past, false)}
              </div>
            </div>
          ) : tab === "forms" ? (
            data.forms.length === 0 ? (
              <p className="text-ink-soft">No forms are required right now.</p>
            ) : (
              <ul className="space-y-4">
                {data.forms.map((f) => (
                  <li key={`${f.templateId}:${f.childId ?? "family"}`} className="border border-line bg-paper p-6">
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <span>
                        <span className="display block text-[1.25rem]">{f.title}</span>
                        <span className="text-[0.8rem] text-ink-soft">{f.forChild ? `For ${f.forChild}` : "For your family"}</span>
                      </span>
                      <span className={`eyebrow text-[0.6rem] ${f.state === "complete" ? "text-ink-soft" : "text-oxblood"}`}>{STATE_LABEL[f.state] ?? f.state}</span>
                    </div>
                    {f.state !== "complete" ? (
                      f.completableOnline ? (
                        <SignForm templateId={f.templateId} childId={f.childId} requiresSignature={f.requiresSignature} body={f.body} version={f.version} />
                      ) : (
                        <p className="mt-3 text-[0.85rem] text-ink-soft">This one needs a document. Please send it to Yalla and we’ll add it to your file.</p>
                      )
                    ) : f.signedAt ? (
                      <p className="mt-2 text-[0.8rem] text-ink-soft">Completed {new Date(f.signedAt).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium" })}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )
          ) : tab === "payments" && data.billing ? (
            <div className="border border-line bg-paper p-7">
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <p className="eyebrow text-[0.6rem] text-ink-soft">Outstanding</p>
                  <p className="display mt-2 text-[2.2rem]">{usd(data.billing.outstandingCents)}</p>
                </div>
                <div>
                  <p className="eyebrow text-[0.6rem] text-ink-soft">Account credit</p>
                  <p className="display mt-2 text-[2.2rem]">{usd(data.billing.creditCents)}</p>
                </div>
              </div>
              <ul className="mt-8 divide-y divide-line border-y border-line">
                {data.billing.invoices.map((i) => (
                  <li key={i.id} className="grid gap-2 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                    <span>
                      <span className="block">{i.description ?? i.number}</span>
                      <span className="text-[0.8rem] text-ink-soft">
                        {i.number} · {new Date(i.issuedAt).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium" })}
                      </span>
                    </span>
                    <span className="text-[0.88rem] sm:text-right">
                      Total {usd(i.totalCents)} · Paid {usd(i.paidCents)}
                      {i.refundedCents ? ` · Refunded ${usd(i.refundedCents)}` : ""}
                      <span className={`block text-[0.8rem] ${i.balanceCents > 0 && i.status === "open" ? "text-oxblood" : "text-ink-soft"}`}>
                        {i.status === "void" ? "Void" : i.balanceCents > 0 ? `Balance ${usd(i.balanceCents)}` : "Paid in full"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[0.78rem] text-ink-soft">Questions about an invoice? Reply to any Yalla email or speak with the team.</p>
            </div>
          ) : (
            <p className="text-ink-soft">Choose a section above.</p>
          )}
        </div>
      </div>
    </div>
  );
}

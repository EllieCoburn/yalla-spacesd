import Link from "next/link";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { ActionForm, Disclosure, TextField } from "@/components/admin/forms";
import { JoinWaitlistForm } from "@/components/admin/programs/JoinWaitlistForm";
import { Card, Empty, FilterBar, FilterField, inputCls, Notice, PageHeader, Pill, Status, Table } from "@/components/admin/ui";
import { familiesForPicker, waitlistRows } from "@/lib/admin/queries/programs";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { programs, sessions } from "@/lib/db/schema";
import { addDaysISO, fmtDate, fmtDateTime, fmtTime, localDateOf, todayLA } from "@/lib/time";
import { expireAction, offerAction, removeAction } from "./actions";

export const metadata = { title: "Waitlist" };

const STATUSES = ["waiting", "offered", "accepted", "expired", "declined", "removed"];

export default async function WaitlistPage({ searchParams }: { searchParams: Promise<{ program?: string; session?: string; status?: string; offered?: string; until?: string }> }) {
  const staff = await requirePermission("bookings.view");
  const sp = await searchParams;
  const db = getDb();
  const canManage = can(staff, "waitlist.manage");
  const today = todayLA();
  const [rows, progs] = await Promise.all([
    waitlistRows(db, { programId: sp.program || undefined, sessionId: sp.session || undefined, status: STATUSES.includes(sp.status ?? "") ? sp.status : undefined }),
    db.select().from(programs).orderBy(asc(programs.name)),
  ]);
  const upcoming = canManage
    ? await db
        .select({ s: sessions, p: programs })
        .from(sessions)
        .innerJoin(programs, eq(programs.id, sessions.programId))
        .where(and(gte(sessions.localDate, today), lte(sessions.localDate, addDaysISO(today, 90)), eq(sessions.status, "scheduled"), eq(programs.waitlistEnabled, true), eq(programs.status, "published")))
        .orderBy(asc(sessions.startsAt))
        .limit(300)
    : [];
  const fams = canManage ? await familiesForPicker(db) : [];
  const offeredLapsed = rows.filter((r) => r.e.status === "offered" && r.e.offerExpiresAt && r.e.offerExpiresAt < new Date()).length;

  return (
    <>
      <PageHeader
        title="Waitlist"
        subtitle="Families waiting for a spot. Offers hold the spot for an acceptance window; nothing is charged or confirmed until the family completes checkout."
        actions={
          canManage ? (
            <ActionForm action={expireAction} className="" submit={{ label: offeredLapsed ? `Expire ${offeredLapsed} lapsed offer${offeredLapsed === 1 ? "" : "s"}` : "Expire lapsed offers", variant: "secondary" }}>
              <span />
            </ActionForm>
          ) : null
        }
      />
      {sp.offered ? (
        <div className="mb-5">
          <Notice tone="positive" title={`Offer sent · ${sp.offered}`}>
            The spot is held{sp.until ? ` until ${sp.until}` : ""}. The family’s message is in Messages. Nothing is charged unless they accept and pay.
          </Notice>
        </div>
      ) : null}
      <FilterBar action="/admin/waitlist">
        <FilterField label="Program">
          <select name="program" defaultValue={sp.program ?? ""} className={inputCls}>
            <option value="">All programs</option>
            {progs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Status">
          <select name="status" defaultValue={sp.status ?? ""} className={inputCls}>
            <option value="">Waiting & offered</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </FilterField>
        {sp.session ? <input type="hidden" name="session" value={sp.session} /> : null}
      </FilterBar>

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Card padded={false}>
          {rows.length === 0 ? (
            <div className="p-5">
              <Empty title="No one on the waitlist">When a session is full and the program allows a waitlist, families can join here — or you can add them.</Empty>
            </div>
          ) : (
            <Table head={["Family", "Requested session", "Joined", "Party", "Eligibility", "Status", ""]}>
              {rows.map((r) => (
                <tr key={r.e.id}>
                  <td>
                    <Link href={`/admin/families/${r.f.id}`} className="font-medium text-ink hover:text-blue">
                      {r.f.name}
                    </Link>
                    <span className="block text-[0.78rem] text-ink-soft">{r.kids.map((k) => k.preferredName || k.firstName).join(", ") || "No children listed"}</span>
                    {r.e.notes ? <span className="mt-1 block max-w-xs text-[0.75rem] whitespace-pre-line text-ink-soft italic">{r.e.notes}</span> : null}
                  </td>
                  <td>
                    {r.s ? (
                      <Link href={`/admin/sessions/${r.s.id}`} className="text-ink hover:text-blue">
                        <span className="block">{r.p.name}</span>
                        <span className="text-[0.78rem] text-ink-soft">
                          {fmtDate(r.s.localDate, "EEE d MMM")} · {fmtTime(r.s.startsAt)}
                        </span>
                      </Link>
                    ) : (
                      <span>
                        {r.p.name} <span className="block text-[0.78rem] text-ink-soft">Any session</span>
                      </span>
                    )}
                  </td>
                  <td className="text-[0.8rem] text-ink-soft">
                    {fmtDate(localDateOf(r.e.createdAt), "d MMM")}
                    {r.position ? <span className="block">#{r.position} in line</span> : null}
                  </td>
                  <td className="tabular-nums">
                    {r.e.partySize} {r.e.partySize === 1 ? "spot" : "spots"}
                  </td>
                  <td>
                    {r.ineligible.length ? (
                      <Pill tone="critical" icon="alert">
                        Age: {r.ineligible.join(", ")}
                      </Pill>
                    ) : r.blocking.length ? (
                      <Pill tone="warning" icon="alert">
                        Paperwork needed
                      </Pill>
                    ) : (
                      <Pill tone="positive" icon="check">Eligible</Pill>
                    )}
                    {r.blocking.length ? (
                      <Link href={`/admin/families/${r.f.id}#paperwork`} className="mt-1 block text-[0.75rem] text-blue hover:underline">
                        {r.blocking.join(", ")}
                      </Link>
                    ) : null}
                    {r.remaining != null && r.e.status === "waiting" ? (
                      <span className={`mt-1 block text-[0.75rem] ${r.remaining >= r.e.partySize ? "text-[#2c6447]" : "text-ink-soft"}`}>
                        {r.remaining <= 0 ? "Session full" : `${r.remaining} spot${r.remaining === 1 ? "" : "s"} open now`}
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <Status kind="waitlist" value={r.e.status} />
                    {r.e.status === "offered" && r.e.offerExpiresAt ? (
                      <span className={`mt-1 block text-[0.75rem] ${r.e.offerExpiresAt < new Date() ? "text-[#8a2333]" : "text-ink-soft"}`}>
                        {r.e.offerExpiresAt < new Date() ? "Lapsed " : "Held until "}
                        {fmtDateTime(r.e.offerExpiresAt)}
                      </span>
                    ) : null}
                    {r.e.offerBookingId ? (
                      <Link href={`/admin/bookings/${r.e.offerBookingId}`} className="mt-0.5 block text-[0.75rem] text-blue hover:underline">
                        Offer booking →
                      </Link>
                    ) : null}
                  </td>
                  <td className="min-w-[12rem]">
                    {canManage && (r.e.status === "waiting" || r.e.status === "offered") ? (
                      <div className="space-y-2">
                        {r.e.status === "waiting" ? (
                          r.canOffer ? (
                            <Disclosure label="Offer spot">
                              <ActionForm
                                action={offerAction}
                                submit={{ label: "Send offer" }}
                                confirm={{ title: `Offer ${r.e.partySize} spot${r.e.partySize === 1 ? "" : "s"} to ${r.f.name}?`, body: "The spot is held for the window you set and released automatically if they don’t accept. They won’t be charged unless they complete checkout.", confirmLabel: "Send offer" }}
                              >
                                <input type="hidden" name="entryId" value={r.e.id} />
                                <TextField name="windowHours" label="Acceptance window (hours)" type="number" defaultValue={r.p.offerWindowHours} />
                              </ActionForm>
                            </Disclosure>
                          ) : (
                            <p className="text-[0.75rem] text-ink-soft">
                              {r.ineligible.length
                                ? "Not eligible by age."
                                : !r.s
                                  ? "Choose a session to offer."
                                  : r.blocking.length
                                    ? `Needs ${r.blocking.join(", ")} before an offer can hold a spot.`
                                    : "Not enough open spots to offer."}
                            </p>
                          )
                        ) : null}
                        <Disclosure label="Remove">
                          <ActionForm action={removeAction} submit={{ label: "Update", variant: "secondary" }}>
                            <input type="hidden" name="entryId" value={r.e.id} />
                            <fieldset className="space-y-1.5 text-[0.84rem]">
                              <legend className="sr-only">Reason</legend>
                              <label className="flex items-center gap-2">
                                <input type="radio" name="status" value="removed" defaultChecked /> Remove
                              </label>
                              <label className="flex items-center gap-2">
                                <input type="radio" name="status" value="declined" /> Family declined
                              </label>
                            </fieldset>
                            <TextField name="note" label="Note (optional)" />
                          </ActionForm>
                        </Disclosure>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <div className="space-y-6">
          <Notice tone="info" title="How offers work">
            An offer creates a held booking for the acceptance window, so the spot can’t be sold to anyone else. If the family doesn’t complete checkout in time, the hold lapses and the spot is released. Families are never charged automatically.
          </Notice>
          {canManage ? (
            <Card title="Add a family to a waitlist">
              <JoinWaitlistForm
                families={fams}
                sessions={upcoming.map(({ s, p }) => ({ id: s.id, label: `${fmtDate(s.localDate, "EEE d MMM")} ${fmtTime(s.startsAt)} · ${s.title ?? p.name}` }))}
              />
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

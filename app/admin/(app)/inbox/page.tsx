import Link from "next/link";
import { ActionForm, TextField } from "@/components/admin/forms";
import { Card, Empty, Notice, PageHeader, Pill, Tabs } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { ENQUIRY_KINDS, inboxList, newEnquiryCount, staffRecipients, type EnquiryKind } from "@/lib/ops/enquiries";
import { notificationsMode } from "@/lib/notify";
import { fmtDateTime } from "@/lib/time";
import { enquiryStatusAction } from "./actions";

export const metadata = { title: "Inbox" };

const TONE = { tour: "info", application: "positive", event: "warning", waitlist: "neutral" } as const;

/** Everything families send through the website, in one place. */
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ status?: string; kind?: string; open?: string }> }) {
  await requirePermission("families.view");
  const sp = await searchParams;
  const db = getDb();
  const status = sp.status ?? "new";
  const [list, count, recipients] = await Promise.all([inboxList(db, { status, kind: sp.kind }), newEnquiryCount(db), staffRecipients(db)]);
  const qs = (o: Record<string, string>) => `/admin/inbox?${new URLSearchParams({ ...(sp.kind ? { kind: sp.kind } : {}), status, ...o })}`;

  return (
    <>
      <PageHeader title="Inbox" subtitle="Tour requests, Club Yalla applications, event enquiries and waitlist sign-ups from the website. Each one is also emailed to the team." />
      <div className="mb-5">
        <Notice tone={notificationsMode() === "live" ? "info" : "warning"} title={`Emailed to ${recipients.join(", ") || "nobody yet"}`}>
          {notificationsMode() === "live" ? "New messages are emailed as they arrive." : "Email delivery isn’t switched on yet, so new messages are only here (and in Messages) for now."} Change the addresses in{" "}
          <Link href="/admin/settings" className="underline">
            Settings → Notifications
          </Link>
          .
        </Notice>
      </div>
      <Tabs
        current={status}
        tabs={[
          { key: "new", label: "New", count, href: qs({ status: "new" }) },
          { key: "handled", label: "Handled", href: qs({ status: "handled" }) },
          { key: "archived", label: "Archived", href: qs({ status: "archived" }) },
          { key: "all", label: "All", href: qs({ status: "all" }) },
        ]}
      />
      <div className="mb-4 flex flex-wrap gap-4 text-[0.84rem]">
        <Link href={`/admin/inbox?status=${status}`} className={!sp.kind ? "font-medium text-ink" : "text-ink-soft hover:text-ink"}>
          Everything
        </Link>
        {(Object.keys(ENQUIRY_KINDS) as EnquiryKind[]).map((k) => (
          <Link key={k} href={`/admin/inbox?status=${status}&kind=${k}`} className={sp.kind === k ? "font-medium text-ink" : "text-ink-soft hover:text-ink"}>
            {ENQUIRY_KINDS[k].plural}
          </Link>
        ))}
      </div>
      {list.length === 0 ? (
        <Empty title={status === "new" ? "You’re all caught up" : "Nothing here"}>New messages from the website will appear here.</Empty>
      ) : (
        <div className="space-y-4">
          {list.map((e) => (
            <Card key={e.id} id={e.id}>
              <details open={sp.open === e.id || status === "new"}>
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                  <span className="flex flex-wrap items-center gap-2">
                    <Pill tone={TONE[e.kind as EnquiryKind] ?? "neutral"}>{ENQUIRY_KINDS[e.kind as EnquiryKind]?.label ?? e.kind}</Pill>
                    <span className="font-medium text-ink">{e.name}</span>
                    <span className="text-[0.82rem] text-ink-soft">{fmtDateTime(e.createdAt)}</span>
                  </span>
                  <span className="text-[0.8rem] text-ink-soft">{e.status === "new" ? "New" : e.status === "handled" ? `Handled by ${e.handledBy}` : "Archived"}</span>
                </summary>
                <dl className="mt-4 grid gap-x-6 gap-y-3 text-[0.86rem] sm:grid-cols-[11rem_1fr]">
                  <dt className="text-ink-soft">Email</dt>
                  <dd>
                    <a href={`mailto:${e.email}?subject=${encodeURIComponent(`Re: your ${ENQUIRY_KINDS[e.kind as EnquiryKind]?.familyNoun ?? "message"} to Yalla`)}`} className="text-blue hover:underline">
                      {e.email}
                    </a>
                  </dd>
                  {e.phone ? (
                    <>
                      <dt className="text-ink-soft">Phone</dt>
                      <dd>
                        <a href={`tel:${e.phone.replace(/[^\d+]/g, "")}`} className="text-blue hover:underline">
                          {e.phone}
                        </a>
                      </dd>
                    </>
                  ) : null}
                  {e.details.map((d, i) => (
                    <div key={i} className="contents">
                      <dt className="text-ink-soft">{d.label}</dt>
                      <dd className="whitespace-pre-wrap text-ink">{d.value}</dd>
                    </div>
                  ))}
                  {e.familyId ? (
                    <>
                      <dt className="text-ink-soft">Family record</dt>
                      <dd>
                        <Link href={`/admin/families/${e.familyId}`} className="text-blue hover:underline">
                          Open family
                        </Link>
                      </dd>
                    </>
                  ) : null}
                  {e.note ? (
                    <>
                      <dt className="text-ink-soft">Staff note</dt>
                      <dd>{e.note}</dd>
                    </>
                  ) : null}
                </dl>
                <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-ink/8 pt-4">
                  {e.status !== "handled" ? (
                    <ActionForm action={enquiryStatusAction} submit={{ label: "Mark handled" }} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="status" value="handled" />
                      <TextField name="note" label="Note (optional)" placeholder="e.g. Tour booked for Tue 10am" />
                    </ActionForm>
                  ) : null}
                  {e.status !== "archived" ? (
                    <ActionForm action={enquiryStatusAction} submit={{ label: "Archive", variant: "ghost" }} className="">
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="status" value="archived" />
                    </ActionForm>
                  ) : null}
                  {e.status !== "new" ? (
                    <ActionForm action={enquiryStatusAction} submit={{ label: "Move back to New", variant: "ghost" }} className="">
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="status" value="new" />
                    </ActionForm>
                  ) : null}
                </div>
              </details>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

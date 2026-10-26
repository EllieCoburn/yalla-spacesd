import Link from "next/link";
import { and, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
import { ManualMessage } from "@/components/admin/billing/ManualMessage";
import { Card, Empty, FilterBar, FilterField, inputCls, Notice, PageHeader, Pill, Status, Table, Tabs } from "@/components/admin/ui";
import { familyOptions } from "@/lib/admin/queries/billing";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { families, messages, messageTemplates } from "@/lib/db/schema";
import { DEFAULT_TEMPLATES, notificationsMode, TEMPLATE_VARIABLES, type TemplateKey } from "@/lib/notify";
import { fmtDateTime, zonedDateTime, addDaysISO } from "@/lib/time";

export const metadata = { title: "Messages" };

const relatedHref = (type: string | null, id: string | null) =>
  !type || !id ? null : type === "booking" ? `/admin/bookings/${id}` : type === "invoice" ? `/admin/billing/invoices/${id}` : type === "family" ? `/admin/families/${id}` : null;

export default async function CommunicationsPage({ searchParams }: { searchParams: Promise<{ tab?: string; template?: string; status?: string; q?: string; from?: string; to?: string; m?: string }> }) {
  const staff = await requirePermission("communications.view");
  const sp = await searchParams;
  const tab = sp.tab === "templates" || sp.tab === "send" ? sp.tab : "history";
  const db = getDb();
  const mode = notificationsMode();
  const manage = can(staff, "communications.manage");

  const tabs = [
    { key: "history", label: "History", href: "/admin/communications" },
    { key: "templates", label: "Templates", href: "/admin/communications?tab=templates" },
    ...(manage ? [{ key: "send", label: "Send a message", href: "/admin/communications?tab=send" }] : []),
  ];

  const banner =
    mode === "test" ? (
      <Notice tone="info" title="Test mode — nothing is sent">
        Every message is recorded here with the status “Captured”, but no email leaves Yalla. To deliver for real, set NOTIFICATIONS_MODE=live, RESEND_API_KEY and NOTIFICATIONS_FROM (a verified sender address) on the deployment.
      </Notice>
    ) : (
      <Notice tone="warning" title="Live mode">
        Messages are being delivered to families. Service messages (bookings, payments, forms) are sent regardless of marketing preferences; marketing is never sent from here.
      </Notice>
    );

  if (tab === "templates") {
    const custom = await db.select().from(messageTemplates);
    const byKey = new Map(custom.map((c) => [c.key, c]));
    return (
      <>
        <PageHeader title="Messages" subtitle="Transactional emails families and staff receive." />
        <Tabs tabs={tabs} current={tab} />
        <div className="mb-5">{banner}</div>
        <Card padded={false}>
          <Table head={["Template", "Audience", "Subject", "Wording", ""]}>
            {(Object.keys(DEFAULT_TEMPLATES) as TemplateKey[]).map((k) => {
              const d = DEFAULT_TEMPLATES[k];
              const c = byKey.get(k);
              const customized = !!c && (c.subject !== d.subject || c.body !== d.body);
              return (
                <tr key={k}>
                  <td className="font-medium">{d.name}</td>
                  <td>
                    <Pill tone="neutral">{d.audience === "billing" ? "Billing contacts" : d.audience === "staff" ? "Staff" : "Guardians"}</Pill>
                  </td>
                  <td className="max-w-[22rem] truncate text-ink-soft">{c?.subject ?? d.subject}</td>
                  <td>{customized ? <Pill tone="info" icon="dot">Edited{c?.updatedBy ? ` by ${c.updatedBy}` : ""}</Pill> : <span className="text-ink-soft">Default</span>}</td>
                  <td>
                    <Link href={`/admin/communications/templates/${k}`} className="text-blue hover:underline">
                      {manage ? "Edit & preview" : "Preview"}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </Table>
        </Card>
        <p className="mt-4 text-[0.8rem] text-ink-soft">All of these are essential service messages. Marketing emails are kept separate and honor each family’s marketing preference.</p>
      </>
    );
  }

  if (tab === "send" && manage) {
    const fams = await familyOptions(db);
    const templates = (Object.keys(DEFAULT_TEMPLATES) as TemplateKey[]).filter((k) => DEFAULT_TEMPLATES[k].audience !== "staff").map((k) => ({ key: k, name: DEFAULT_TEMPLATES[k].name, variables: TEMPLATE_VARIABLES[k] }));
    return (
      <>
        <PageHeader title="Messages" subtitle="Send a one-off service message to a family." />
        <Tabs tabs={tabs} current={tab} />
        <div className="mb-5">{banner}</div>
        <div className="max-w-2xl">
          <Card>
            <ManualMessage families={fams} templates={templates} />
          </Card>
        </div>
      </>
    );
  }

  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const rows = await db
    .select({ m: messages, f: families })
    .from(messages)
    .leftJoin(families, eq(families.id, messages.familyId))
    .where(
      and(
        sp.template ? eq(messages.templateKey, sp.template) : undefined,
        sp.status ? eq(messages.status, sp.status) : undefined,
        sp.q ? or(ilike(messages.toAddress, `%${sp.q}%`), ilike(families.name, `%${sp.q}%`), ilike(messages.subject, `%${sp.q}%`)) : undefined,
        sp.from && iso.test(sp.from) ? gte(messages.createdAt, zonedDateTime(sp.from, "00:00")) : undefined,
        sp.to && iso.test(sp.to) ? lte(messages.createdAt, zonedDateTime(addDaysISO(sp.to, 1), "00:00")) : undefined,
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(200);
  const selected = sp.m ? (await db.select({ m: messages, f: families }).from(messages).leftJoin(families, eq(families.id, messages.familyId)).where(eq(messages.id, sp.m)))[0] : null;
  const qs = (extra: Record<string, string>) => `/admin/communications?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([k, v]) => v && k !== "m")), ...extra } as Record<string, string>)}`;

  return (
    <>
      <PageHeader title="Messages" subtitle="What was sent, to whom, and its delivery status." />
      <Tabs tabs={tabs} current={tab} />
      <div className="mb-5">{banner}</div>
      <FilterBar action="/admin/communications">
        <FilterField label="Search">
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Family, email, subject" className={inputCls} />
        </FilterField>
        <FilterField label="Template">
          <select name="template" defaultValue={sp.template ?? ""} className={inputCls}>
            <option value="">All templates</option>
            {(Object.keys(DEFAULT_TEMPLATES) as TemplateKey[]).map((k) => (
              <option key={k} value={k}>
                {DEFAULT_TEMPLATES[k].name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Status">
          <select name="status" defaultValue={sp.status ?? ""} className={inputCls}>
            <option value="">Any status</option>
            <option value="captured">Captured (test)</option>
            <option value="sent">Sent</option>
            <option value="delivered">Delivered</option>
            <option value="failed">Failed</option>
          </select>
        </FilterField>
        <FilterField label="From">
          <input type="date" name="from" defaultValue={sp.from ?? ""} className={inputCls} />
        </FilterField>
        <FilterField label="To">
          <input type="date" name="to" defaultValue={sp.to ?? ""} className={inputCls} />
        </FilterField>
      </FilterBar>
      <div className={`grid gap-6 ${selected ? "xl:grid-cols-[1.3fr_1fr]" : ""}`}>
        <Card padded={false}>
          {rows.length === 0 ? (
            <div className="p-5">
              <Empty title="No messages match" />
            </div>
          ) : (
            <Table head={["When", "To", "Family", "Message", "Status"]} dense>
              {rows.map(({ m, f }) => (
                <tr key={m.id} className={selected?.m.id === m.id ? "bg-mist/50" : ""}>
                  <td className="whitespace-nowrap text-ink-soft">{fmtDateTime(m.createdAt)}</td>
                  <td className="max-w-[12rem] truncate">{m.toAddress}</td>
                  <td>{f?.name ?? <span className="text-ink-soft">Staff</span>}</td>
                  <td className="max-w-[18rem]">
                    <Link href={qs({ m: m.id })} className="block truncate text-ink hover:text-blue">
                      {m.subject}
                    </Link>
                    <span className="text-[0.72rem] text-ink-soft">{m.templateKey ? DEFAULT_TEMPLATES[m.templateKey as TemplateKey]?.name : "Custom"}</span>
                  </td>
                  <td>
                    <Status kind="message" value={m.status} />
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        {selected ? (
          <Card title="Message" actions={<Link href={qs({})} className="text-ink-soft hover:text-ink">Close</Link>}>
            <dl className="space-y-1.5 text-[0.84rem]">
              <div className="flex gap-2">
                <dt className="w-20 text-ink-soft">To</dt>
                <dd>{selected.m.toAddress}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-20 text-ink-soft">Sent</dt>
                <dd>
                  {fmtDateTime(selected.m.createdAt)} {selected.m.createdBy ? `by ${selected.m.createdBy}` : "automatically"}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-20 text-ink-soft">Status</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  <Status kind="message" value={selected.m.status} />
                  <span className="text-ink-soft">{selected.m.mode === "test" ? "Test mode" : "Live"}</span>
                  {selected.m.error ? <span className="text-[#8a2333]">{selected.m.error}</span> : null}
                </dd>
              </div>
              {relatedHref(selected.m.relatedType, selected.m.relatedId) ? (
                <div className="flex gap-2">
                  <dt className="w-20 text-ink-soft">About</dt>
                  <dd>
                    <Link className="text-blue hover:underline" href={relatedHref(selected.m.relatedType, selected.m.relatedId)!}>
                      Open {selected.m.relatedType}
                    </Link>
                  </dd>
                </div>
              ) : null}
            </dl>
            <div className="mt-4 rounded-lg border border-ink/10 bg-white">
              <p className="border-b border-ink/8 px-4 py-2.5 text-[0.9rem] font-medium">{selected.m.subject}</p>
              <pre className="px-4 py-3 font-sans text-[0.85rem] leading-relaxed whitespace-pre-wrap">{selected.m.body}</pre>
            </div>
          </Card>
        ) : null}
      </div>
    </>
  );
}

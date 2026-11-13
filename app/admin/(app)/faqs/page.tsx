import Link from "next/link";
import { LinkButton, Notice, PageHeader, Pill, Table, Tabs } from "@/components/admin/ui";
import { FAQ_CATEGORIES, FAQ_PAGES } from "@/content/faq";
import { requirePermission } from "@/lib/auth/session";
import { allFaqs } from "@/lib/faq";

export const metadata = { title: "FAQs" };

const STATUS_TONE = { published: "positive", draft: "warning", archived: "muted" } as const;
const STATUS_LABEL = { published: "Published", draft: "Draft", archived: "Archived" } as const;

export default async function FaqAdmin({ searchParams }: { searchParams: Promise<{ category?: string; show?: string }> }) {
  await requirePermission("content.manage");
  const sp = await searchParams;
  const all = await allFaqs();
  const category = FAQ_CATEGORIES.some((c) => c.key === sp.category) ? sp.category! : "all";
  const show = sp.show === "drafts" ? "drafts" : sp.show === "archived" ? "archived" : "current";
  const list = all
    .filter((f) => category === "all" || f.category === category || f.alsoIn?.includes(category as never))
    .filter((f) => (show === "archived" ? f.status === "archived" : show === "drafts" ? f.status === "draft" : f.status !== "archived"))
    .sort((a, b) => FAQ_CATEGORIES.findIndex((c) => c.key === a.category) - FAQ_CATEGORIES.findIndex((c) => c.key === b.category) || a.order - b.order);
  const drafts = all.filter((f) => f.status === "draft").length;
  const qs = (o: Record<string, string>) => `/admin/faqs?${new URLSearchParams({ ...(category !== "all" ? { category } : {}), ...(show !== "current" ? { show } : {}), ...o })}`;

  return (
    <>
      <PageHeader
        title="FAQs"
        subtitle="Each question is written once and appears on the FAQ page and on any program page it’s chosen for. Changes go live everywhere as soon as you save."
        actions={<LinkButton href="/admin/faqs/new" variant="primary">Add a question</LinkButton>}
      />
      {drafts ? (
        <div className="mb-5">
          <Notice tone="warning" title={`${drafts} question${drafts === 1 ? "" : "s"} waiting for answers`}>
            Drafts aren’t shown on the site. Each one notes what Yalla needs to confirm before it can be published.{" "}
            <Link href={qs({ show: "drafts" })} className="underline">
              See drafts
            </Link>
          </Notice>
        </div>
      ) : null}
      <Tabs
        current={category}
        tabs={[{ key: "all", label: "All", href: `/admin/faqs${show !== "current" ? `?show=${show}` : ""}` }, ...FAQ_CATEGORIES.map((c) => ({ key: c.key, label: c.label, href: `/admin/faqs?${new URLSearchParams({ category: c.key, ...(show !== "current" ? { show } : {}) })}` }))]}
      />
      <div className="mb-4 flex gap-4 text-[0.84rem]">
        {(["current", "drafts", "archived"] as const).map((s) => (
          <Link key={s} href={`/admin/faqs?${new URLSearchParams({ ...(category !== "all" ? { category } : {}), ...(s !== "current" ? { show: s } : {}) })}`} className={show === s ? "font-medium text-ink" : "text-ink-soft hover:text-ink"}>
            {s === "current" ? "Published & drafts" : s === "drafts" ? "Drafts only" : "Archived"}
          </Link>
        ))}
      </div>
      <Table head={["Question", "Category", "Also on", "Order", "Status"]}>
        {list.map((f) => (
          <tr key={f.id}>
            <td className="max-w-[28rem]">
              <Link href={`/admin/faqs/${f.id}`} className="font-medium text-ink hover:text-blue">
                {f.question}
              </Link>
              {f.status === "draft" && f.needs ? <p className="mt-1 text-[0.78rem] text-ink-soft">Needs: {f.needs}</p> : null}
              {f.policy ? <p className="mt-1 text-[0.78rem] text-ink-soft">Shows the approved policy</p> : null}
            </td>
            <td>{FAQ_CATEGORIES.find((c) => c.key === f.category)?.label}</td>
            <td className="text-[0.8rem] text-ink-soft">
              {[...(f.alsoIn ?? []).map((c) => `FAQ: ${FAQ_CATEGORIES.find((x) => x.key === c)?.label}`), ...Object.keys(f.pages ?? {}).map((p) => FAQ_PAGES.find((x) => x.key === p)?.label ?? p)].join(" · ") || "FAQ page only"}
            </td>
            <td className="tabular-nums">{f.order}</td>
            <td>
              <Pill tone={STATUS_TONE[f.status]}>{STATUS_LABEL[f.status]}</Pill>
              {f.custom ? <span className="ml-2 text-[0.75rem] text-ink-soft">New</span> : f.edited ? <span className="ml-2 text-[0.75rem] text-ink-soft">Edited</span> : null}
            </td>
          </tr>
        ))}
      </Table>
      {!list.length ? <p className="mt-6 text-ink-soft">No questions here.</p> : null}
    </>
  );
}

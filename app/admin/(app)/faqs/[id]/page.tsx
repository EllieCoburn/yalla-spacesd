import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SelectField, TextArea, TextField } from "@/components/admin/forms";
import { Card, Notice, PageHeader } from "@/components/admin/ui";
import { FaqAnswer } from "@/components/faq/FaqAnswer";
import { DEFAULT_FAQS, FAQ_CATEGORIES, FAQ_PAGES, type Faq } from "@/content/faq";
import { policyById, policyHref } from "@/content/policies";
import { requirePermission } from "@/lib/auth/session";
import { allFaqs } from "@/lib/faq";
import { resetFaqAction, saveFaqAction } from "../actions";

export const metadata = { title: "Edit FAQ" };

export default async function EditFaq({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  await requirePermission("content.manage");
  const { id } = await params;
  const sp = await searchParams;
  const isNew = id === "new";
  const found = isNew ? null : (await allFaqs()).find((f) => f.id === id);
  if (!isNew && !found) notFound();
  const f: Faq & { edited?: boolean } = found ?? { id: "", question: "", answer: "", category: "getting-started", order: 999, status: "draft" };
  const policy = f.policy ? policyById(f.policy) : null;
  const isOriginal = DEFAULT_FAQS.some((d) => d.id === f.id);

  return (
    <>
      <PageHeader title={isNew ? "Add a question" : f.question} back={{ href: "/admin/faqs", label: "FAQs" }} />
      {sp.saved ? (
        <div className="mb-5">
          <Notice tone="positive" title="Saved" />
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <ActionForm action={saveFaqAction} submit={{ label: isNew ? "Add question" : "Save", pending: "Saving…" }}>
              <input type="hidden" name="id" value={f.id} />
              <TextField name="question" label="Question" required defaultValue={f.question} />
              {policy ? (
                <Notice tone="info" title="This answer is Yalla’s approved policy">
                  It shows the {policy.title.toLowerCase()} exactly as written, so the policy only lives in one place. To change the policy wording, ask your developer to update it (content/policies.ts); it then
                  updates here, on the FAQ page and on <Link href={policyHref(policy.id)} className="underline">Policies &amp; Terms</Link>.
                </Notice>
              ) : (
                <TextArea
                  name="answer"
                  label="Answer"
                  rows={9}
                  defaultValue={f.answer}
                  hint={
                    <>
                      Leave a blank line between paragraphs. Start lines with “- ” for a list. Links: [words](/page). Bold: **words**. Keep it short and friendly; link to Policies &amp; Terms for anything formal.
                    </>
                  }
                />
              )}
              <div className="grid gap-4 sm:grid-cols-3">
                <SelectField name="category" label="Category on the FAQ page" defaultValue={f.category} options={FAQ_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))} />
                <TextField name="order" label="Order" type="number" defaultValue={f.order} hint="Lower numbers come first." />
                <SelectField
                  name="status"
                  label="Status"
                  defaultValue={f.status}
                  options={[
                    { value: "published", label: "Published" },
                    { value: "draft", label: "Draft (hidden)" },
                    { value: "archived", label: "Archived (hidden)" },
                  ]}
                />
              </div>
              <fieldset>
                <legend className="text-[0.8rem] font-medium text-ink">Also show in these FAQ categories</legend>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-[0.85rem]">
                  {FAQ_CATEGORIES.map((c) => (
                    <label key={c.key} className="inline-flex items-center gap-2">
                      <input type="checkbox" name="alsoIn" value={c.key} defaultChecked={f.alsoIn?.includes(c.key)} className="h-4 w-4 rounded border-ink/30" />
                      {c.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="text-[0.8rem] font-medium text-ink">Show on program pages</legend>
                <p className="text-[0.75rem] text-ink-soft">Give a position (1 first) to include it in that page’s “A few good questions.” Leave blank to leave it off. Pages show up to six (five on Flex, Camp and Happenings).</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {FAQ_PAGES.map((p) => (
                    <label key={p.key} className="flex items-center justify-between gap-3 text-[0.85rem]">
                      <span>{p.label}</span>
                      <input type="number" name={`page_${p.key}`} defaultValue={f.pages?.[p.key] ?? ""} min={1} className="h-9 w-20 rounded-lg border border-ink/15 bg-white px-2 tabular-nums" />
                    </label>
                  ))}
                </div>
              </fieldset>
              <TextArea name="needs" label="Waiting on (for drafts)" rows={2} defaultValue={f.needs ?? ""} hint="What Yalla still needs to confirm. Only staff see this." />
            </ActionForm>
          </Card>
        </div>
        <div className="space-y-6">
          {!isNew ? (
            <Card title="Preview">
              <p className="font-serif text-[1.2rem] leading-snug">{f.question}</p>
              <div className="mt-3 text-[0.9rem] text-ink-soft">
                {f.policy || f.answer ? <FaqAnswer faq={f} policyLink={false} /> : <p className="italic">No answer yet.</p>}
              </div>
              {f.status === "published" ? (
                <p className="mt-4 text-[0.82rem]">
                  <Link href={`/faq?q=${f.id}`} className="text-blue underline-offset-4 hover:underline" target="_blank">
                    View on the FAQ page
                  </Link>
                </p>
              ) : null}
            </Card>
          ) : null}
          {isOriginal && found?.edited ? (
            <Card title="Original wording">
              <p className="text-[0.84rem] text-ink-soft">Undo every edit to this question and go back to how it was first written.</p>
              <div className="mt-3">
                <ActionForm action={resetFaqAction} submit={{ label: "Reset to original", variant: "secondary" }} confirm={{ title: "Reset this question?", body: "Your edits to this question will be replaced by the original wording.", confirmLabel: "Reset" }}>
                  <input type="hidden" name="id" value={f.id} />
                </ActionForm>
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

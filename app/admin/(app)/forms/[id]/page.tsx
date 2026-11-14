import Link from "next/link";
import { effectiveFields, OFFERING_KINDS } from "@/lib/ops/forms";
import { Markup } from "@/components/faq/FaqAnswer";

const FIELD_TYPE: Record<string, string> = { choice: "choice", text: "short answer", textarea: "answer", agree: "tick to agree", initials: "initials", signature: "signature" };
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ENFORCEMENT_LABEL, FREQUENCY_LABEL, KIND_LABEL, LEGAL_NOTE, SCOPE_LABEL } from "@/components/admin/forms-admin/labels";
import { ActionForm, Checkbox, Disclosure, SelectField, TextArea, TextField } from "@/components/admin/forms";
import { btn, Card, DL, inputCls, Notice, PageHeader, Pill, Status, Table } from "@/components/admin/ui";
import { formDetail } from "@/lib/admin/queries/families";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { children, families, guardians, programs, sessions } from "@/lib/db/schema";
import { addDaysISO, fmtDate, fmtDateTime, todayLA } from "@/lib/time";
import { addRequirementAction, publishVersionAction, recordSubmissionAction, removeRequirementAction, updateTemplateAction } from "../actions";

const ageText = (m: number) => (m % 12 === 0 ? `${m / 12} yr` : m < 24 ? `${m} mo` : `${Math.floor(m / 12)} yr ${m % 12} mo`);
/** "Ages 18 mo – 5 yr · Club Yalla, Yalla Flex" */
function audience(r: { minAgeMonths: number | null; maxAgeMonths: number | null; programKinds: string[] }) {
  const parts: string[] = [];
  if (r.minAgeMonths != null && r.maxAgeMonths != null) parts.push(`Ages ${ageText(r.minAgeMonths)} – ${ageText(r.maxAgeMonths)}`);
  else if (r.minAgeMonths != null) parts.push(`Ages ${ageText(r.minAgeMonths)} and up`);
  else if (r.maxAgeMonths != null) parts.push(`Up to ${ageText(r.maxAgeMonths)}`);
  if (r.programKinds.length) parts.push(r.programKinds.map((k) => OFFERING_KINDS.find((o) => o.value === k)?.label ?? k).join(", "));
  return parts.join(" · ");
}

export default async function FormDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; record?: string; family?: string; child?: string; v?: string }> }) {
  const staff = await requirePermission("forms.view");
  const { id } = await params;
  const sp = await searchParams;
  const db = getDb();
  const d = await formDetail(db, id);
  if (!d) notFound();
  const t = d.template;
  const manage = can(staff, "forms.manage");
  const docs = can(staff, "forms.documents");
  const current = d.versions.find((v) => v.id === t.currentVersionId);
  const viewing = d.versions.find((v) => String(v.version) === sp.v) ?? current;

  const [progRows, famRows] = manage
    ? await Promise.all([db.select().from(programs).orderBy(asc(programs.name)), db.select().from(families).where(eq(families.status, "active")).orderBy(asc(families.name))])
    : [[], []];
  const today = todayLA();
  const eventSessions = manage
    ? await db
        .select({ s: sessions, p: programs })
        .from(sessions)
        .innerJoin(programs, eq(programs.id, sessions.programId))
        .where(and(gte(sessions.localDate, today), lte(sessions.localDate, addDaysISO(today, 120)), inArray(programs.kind, ["happening", "camp", "private_event", "parents_night", "weekend"]), eq(sessions.status, "scheduled")))
        .orderBy(asc(sessions.startsAt))
        .limit(80)
    : [];
  const allKids = manage ? await db.select({ c: children, f: families }).from(children).innerJoin(families, eq(families.id, children.familyId)).where(eq(families.status, "active")).orderBy(asc(families.name), asc(children.firstName)) : [];

  const recordFamily = manage && sp.family ? famRows.find((f) => f.id === sp.family) : undefined;
  const recordKids = recordFamily ? allKids.filter((k) => k.f.id === recordFamily.id).map((k) => k.c) : [];
  const recordGuardians = recordFamily ? await db.select().from(guardians).where(eq(guardians.familyId, recordFamily.id)).orderBy(desc(guardians.isPrimary)) : [];

  return (
    <>
      <PageHeader
        back={{ href: "/admin/forms", label: "Forms & waivers" }}
        title={t.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Pill tone="neutral">{KIND_LABEL[t.kind] ?? t.kind}</Pill>
            <Pill tone={t.enforcement === "blocks_booking" ? "critical" : t.enforcement === "before_attendance" ? "warning" : "muted"} icon={t.enforcement === "informational" ? "minus" : "alert"}>
              {ENFORCEMENT_LABEL[t.enforcement]}
            </Pill>
            <span>
              {FREQUENCY_LABEL[t.frequency]}
              {t.validForMonths ? ` (every ${t.validForMonths} months)` : ""} · {t.perChild ? "per child" : "per family"} · {t.requiresSignature ? "signature required" : "no signature"}
            </span>
            {t.status === "archived" ? <Pill tone="muted" icon="x">Archived</Pill> : null}
          </span>
        }
        actions={manage ? <Link href={`/admin/forms/${t.id}?record=1#record`} className={btn.secondary}>Record a submission</Link> : null}
      />
      {sp.created ? (
        <div className="mb-5">
          <Notice tone="positive" title="Version 1 published">Now choose who this form is required for.</Notice>
        </div>
      ) : null}
      {t.kind === "waiver" || t.kind === "policy" ? (
        <div className="mb-5">
          <Notice tone="warning" title="Approved language">{LEGAL_NOTE}</Notice>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card
            title={viewing ? `Version ${viewing.version}${viewing.id === current?.id ? " (current)" : " (superseded)"}` : "No published version"}
            actions={
              <span className="flex flex-wrap gap-1">
                {d.versions.map((v) => (
                  <Link key={v.id} href={`/admin/forms/${t.id}?v=${v.version}`} aria-current={v.id === viewing?.id ? "true" : undefined} className={`rounded-md px-2 py-0.5 text-[0.75rem] ${v.id === viewing?.id ? "bg-ink text-chalk" : "text-ink-soft hover:bg-ink/5"}`}>
                    v{v.version}
                  </Link>
                ))}
              </span>
            }
          >
            {viewing ? (
              <>
                <div className="max-h-[28rem] space-y-3 overflow-y-auto rounded-lg border border-ink/8 bg-white p-4 text-[0.88rem] leading-relaxed text-ink">
                  <Markup text={viewing.body} />
                  {effectiveFields(viewing, t.requiresSignature).length ? (
                    <div className="border-t border-ink/8 pt-3">
                      <p className="text-[0.75rem] font-medium tracking-wide text-ink-soft uppercase">Questions</p>
                      <ol className="mt-2 list-decimal space-y-1.5 pl-5">
                        {effectiveFields(viewing, t.requiresSignature)
                          .filter((fl) => fl.type !== "heading" && fl.type !== "info")
                          .map((fl) => (
                            <li key={fl.id}>
                              {fl.label}
                              <span className="text-ink-soft">
                                {" "}
                                · {FIELD_TYPE[fl.type] ?? fl.type}
                                {"options" in fl ? `: ${fl.options.map((o) => o.label).join(" / ")}` : ""}
                                {"showIf" in fl && fl.showIf ? " · only if the earlier answer applies" : ""}
                                {"required" in fl && fl.required === false ? " · optional" : ""}
                              </span>
                            </li>
                          ))}
                      </ol>
                    </div>
                  ) : null}
                </div>
                <DL
                  cols={3}
                  items={[
                    { label: "Published", value: `${fmtDateTime(viewing.publishedAt)} by ${viewing.publishedBy ?? "—"}` },
                    { label: "Re-signing", value: viewing.requiresResign ? "Earlier signers must sign again" : "Earlier signatures stay valid" },
                    { label: "Content fingerprint", value: <code className="text-[0.72rem] break-all">{viewing.contentHash.slice(0, 16)}…</code> },
                  ]}
                />
              </>
            ) : null}
            {manage && current ? (
              <div className="mt-4">
                <Disclosure label="Publish a new version">
                  <p className="mb-3 text-[0.8rem] text-ink-soft">This creates version {(d.versions[0]?.version ?? 0) + 1}. Version {current.version} and every copy signed against it stay exactly as they are.</p>
                  <ActionForm action={publishVersionAction} submit={{ label: "Publish new version" }} confirm={{ title: "Publish this as a new version?", body: "Published versions can’t be edited afterwards.", confirmLabel: "Publish" }}>
                    <input type="hidden" name="templateId" value={t.id} />
                    <TextArea name="body" label="Full text of the new version" rows={10} required defaultValue={current.body} />
                    <Checkbox name="requiresResign" defaultChecked label="Families must sign this new version" hint="Turn off only for corrections that don’t change meaning (e.g. a typo). When on, everyone who signed earlier shows “New version to sign”." />
                  </ActionForm>
                </Disclosure>
              </div>
            ) : null}
          </Card>

          <Card title={`Submissions (${d.submissions.length})`} padded={false}>
            {d.submissions.length === 0 ? (
              <p className="px-5 py-4 text-[0.85rem] text-ink-soft">No one has completed this form yet.</p>
            ) : (
              <Table head={["Family / child", "Signed or submitted by", "When", "Version", "Status", ""]} dense>
                {d.submissions.map(({ s, f, c, v }) => (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/admin/families/${f.id}`} className="text-ink hover:text-blue">
                        {f.name}
                      </Link>
                      {c ? <span className="block text-[0.75rem] text-ink-soft">{c.preferredName || c.firstName}</span> : null}
                    </td>
                    <td>
                      {s.signerName ?? (s.recordedByStaffId ? "Recorded by staff" : "—")}
                      {s.signerRelationship ? <span className="block text-[0.75rem] text-ink-soft">{s.signerRelationship}</span> : null}
                    </td>
                    <td className="whitespace-nowrap">{fmtDateTime(s.signedAt ?? s.createdAt)}</td>
                    <td>
                      v{v.version}
                      {v.id !== t.currentVersionId ? <span className="block text-[0.72rem] text-ink-soft">earlier</span> : null}
                    </td>
                    <td>
                      <Pill tone={s.status === "signed" || s.status === "submitted" ? "positive" : "muted"} icon={s.status === "superseded" ? "arrow" : s.status === "rejected" ? "x" : "check"}>
                        {s.status === "signed" ? "Signed" : s.status === "submitted" ? "Submitted" : s.status === "superseded" ? "Superseded" : "Rejected"}
                      </Pill>
                      {s.expiresOn ? <span className="block text-[0.72rem] text-ink-soft">expires {fmtDate(s.expiresOn, "d MMM yyyy")}</span> : null}
                    </td>
                    <td>
                      <Link href={`/admin/forms/submissions/${s.id}`} className="text-blue hover:underline">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          {manage ? (
            <Card id="record" title="Record a submission for a family">
              <p className="mb-3 text-[0.8rem] text-ink-soft">For paper originals or forms completed with staff. The record shows it was entered by you.</p>
              <form action={`/admin/forms/${t.id}#record`} className="mb-4 flex flex-wrap items-end gap-2">
                <input type="hidden" name="record" value="1" />
                <label className="flex min-w-[14rem] flex-1 flex-col gap-1.5 text-[0.8rem] font-medium">
                  Family
                  <select name="family" defaultValue={recordFamily?.id ?? ""} className={inputCls}>
                    <option value="">Choose a family…</option>
                    {famRows.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button className={btn.secondary}>Choose</button>
              </form>
              {recordFamily ? (
                <ActionForm action={recordSubmissionAction} submit={{ label: t.requiresSignature ? "Record signature" : "Record submission" }}>
                  <input type="hidden" name="templateId" value={t.id} />
                  <input type="hidden" name="familyId" value={recordFamily.id} />
                  {t.perChild ? (
                    <SelectField name="childId" label="Child" required defaultValue={sp.child ?? recordKids[0]?.id} options={recordKids.map((k) => ({ value: k.id, label: `${k.preferredName || k.firstName} ${k.lastName}` }))} />
                  ) : null}
                  <SelectField
                    name="signerGuardianId"
                    label={t.requiresSignature ? "Signing guardian" : "Completed by (optional)"}
                    required={t.requiresSignature}
                    options={[...(t.requiresSignature ? [] : [{ value: "", label: "—" }]), ...recordGuardians.map((g) => ({ value: g.id, label: `${g.firstName} ${g.lastName}${g.relationship ? ` (${g.relationship})` : ""}` }))]}
                  />
                  {t.requiresSignature ? (
                    <>
                      <TextField name="signatureText" label="Typed signature (guardian’s full name)" required />
                      <Checkbox name="consent" label="The guardian agreed to sign electronically and read the current version" />
                    </>
                  ) : (
                    <input type="hidden" name="consent" value="on" />
                  )}
                  <label className="block space-y-1.5">
                    <span className="text-[0.8rem] font-medium text-ink">Attach a document {t.kind === "upload" ? <span className="text-[#8a2333]">*</span> : "(optional)"}</span>
                    <input type="file" name="file" accept="application/pdf,image/png,image/jpeg,image/heic,image/webp" className="block w-full text-[0.85rem] file:mr-3 file:rounded-lg file:border-0 file:bg-ink file:px-3 file:py-2 file:text-chalk" />
                    <span className="text-[0.75rem] text-ink-soft">PDF or image, up to 8 MB. Stored privately — never at a public link.</span>
                  </label>
                  <TextField name="staffNote" label="Staff note (optional)" />
                </ActionForm>
              ) : null}
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card title="Required for">
            {d.requirements.length === 0 ? <p className="text-[0.85rem] text-[#8a5212]">Not required anywhere yet.</p> : null}
            <ul className="divide-y divide-ink/6">
              {d.requirements.map(({ r, p, f, c }) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="text-[0.85rem] text-ink">
                    {SCOPE_LABEL[r.scope] ?? r.scope}
                    {p ? `: ${p.name}` : f ? `: ${f.name}` : c ? `: ${c.preferredName || c.firstName} ${c.lastName}` : r.sessionId ? `: session ${r.sessionId.slice(0, 8)}` : ""}
                    {audience(r) ? <span className="block text-[0.78rem] text-ink-soft">{audience(r)}</span> : null}
                  </span>
                  {manage ? (
                    <ActionForm action={removeRequirementAction} submit={{ label: "Remove", variant: "ghost" }} confirm={{ title: "Remove this requirement?", body: "Families will no longer be asked for this form in that context. Existing submissions are kept.", confirmLabel: "Remove", danger: true }}>
                      <input type="hidden" name="requirementId" value={r.id} />
                    </ActionForm>
                  ) : null}
                </li>
              ))}
            </ul>
            {manage ? (
              <div className="mt-3">
                <Disclosure label="Add requirement">
                  <ActionForm action={addRequirementAction} submit={{ label: "Add" }} resetOnSuccess>
                    <input type="hidden" name="templateId" value={t.id} />
                    <SelectField name="scope" label="Required for" options={Object.entries(SCOPE_LABEL).map(([value, label]) => ({ value, label }))} />
                    <SelectField name="programId" label="Program (if “program”)" options={[{ value: "", label: "—" }, ...progRows.map((p) => ({ value: p.id, label: p.name }))]} />
                    <SelectField name="familyId" label="Family (if “one family”)" options={[{ value: "", label: "—" }, ...famRows.map((f) => ({ value: f.id, label: f.name }))]} />
                    <SelectField name="childId" label="Child (if “one child”)" options={[{ value: "", label: "—" }, ...allKids.map((k) => ({ value: k.c.id, label: `${k.c.preferredName || k.c.firstName} ${k.c.lastName} · ${k.f.name}` }))]} />
                    <SelectField name="sessionId" label="Event (if “specific event”)" options={[{ value: "", label: "—" }, ...eventSessions.map((e) => ({ value: e.s.id, label: `${e.s.title ?? e.p.name} · ${fmtDate(e.s.localDate, "EEE d MMM")}` }))]} />
                    <fieldset className="rounded-lg border border-ink/10 p-3">
                      <legend className="px-1 text-[0.8rem] font-medium text-ink">Only children who are… (optional)</legend>
                      <p className="text-[0.75rem] text-ink-soft">Leave blank to include everyone the rule above covers.</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <TextField name="minAgeYears" label="At least (years)" type="number" />
                        <TextField name="minAgeMonths" label="+ months" type="number" />
                        <TextField name="maxAgeYears" label="At most (years)" type="number" />
                        <TextField name="maxAgeMonths" label="+ months" type="number" />
                      </div>
                      <p className="mt-3 text-[0.8rem] text-ink">Enrolled in or booked for</p>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[0.82rem]">
                        {OFFERING_KINDS.map((o) => (
                          <label key={o.value} className="inline-flex items-center gap-1.5">
                            <input type="checkbox" name="programKinds" value={o.value} className="h-4 w-4 rounded border-ink/30" />
                            {o.label}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  </ActionForm>
                </Disclosure>
              </div>
            ) : null}
          </Card>

          {manage ? (
            <Card title="Settings">
              <ActionForm action={updateTemplateAction} submit={{ label: "Save settings", variant: "secondary" }}>
                <input type="hidden" name="templateId" value={t.id} />
                <TextField name="title" label="Title" required defaultValue={t.title} />
                <TextField name="description" label="Description" defaultValue={t.description} />
                <SelectField name="enforcement" label="Requirement level" defaultValue={t.enforcement} options={Object.entries(ENFORCEMENT_LABEL).map(([value, label]) => ({ value, label }))} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField name="frequency" label="How often" defaultValue={t.frequency} options={Object.entries(FREQUENCY_LABEL).map(([value, label]) => ({ value, label }))} />
                  <TextField name="validForMonths" label="Renew every (months)" type="number" defaultValue={t.validForMonths} />
                </div>
                <SelectField name="status" label="Status" defaultValue={t.status} options={[{ value: "active", label: "Active" }, { value: "archived", label: "Archived (no longer requested)" }]} />
                <p className="text-[0.75rem] text-ink-soft">Changing these settings doesn’t alter any version or signed copy.</p>
              </ActionForm>
            </Card>
          ) : null}
          {!docs ? <Notice tone="muted">Opening completed documents requires the “Open completed forms and documents” permission.</Notice> : null}
          <Card title="Status meanings">
            <ul className="space-y-2 text-[0.8rem] text-ink-soft">
              {(["complete", "missing", "unsigned", "expired", "needs_resign"] as const).map((k) => (
                <li key={k} className="flex items-center gap-2">
                  <Status kind="paperwork" value={k} />
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

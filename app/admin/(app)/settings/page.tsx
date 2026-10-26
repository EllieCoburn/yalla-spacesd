import Link from "next/link";
import { ActionForm, Checkbox, Disclosure, SelectField, TextArea, TextField } from "@/components/admin/forms";
import { InviteForm, SmallAction } from "@/components/admin/billing/InviteResult";
import { Card, Notice, PageHeader, Pill, Table, Tabs, inputCls } from "@/components/admin/ui";
import { allRoles, locationsCohortsPools, staffDirectory, systemStatus } from "@/lib/admin/queries/settings";
import { PERMISSION_GROUPS } from "@/lib/auth/permissions";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { getOperatingHours, listPolicies, poolUsage } from "@/lib/ops/settings";
import { fmtDateTime } from "@/lib/time";
import { cohortAction, createRoleAction, hoursAction, inviteAction, locationAction, permissionsAction, policyAction, poolAction, resendInviteAction, roleAction, statusAction } from "./actions";
import { redirect } from "next/navigation";

export const metadata = { title: "Settings" };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const staff = await requireStaff();
  const canSettings = can(staff, "settings.manage");
  const canStaff = can(staff, "staff.manage");
  if (!canSettings && !canStaff) redirect("/admin/forbidden?need=settings.manage");
  const sp = await searchParams;
  const tabs = [
    ...(canSettings
      ? [
          { key: "policies", label: "Policies", href: "/admin/settings?tab=policies" },
          { key: "locations", label: "Locations", href: "/admin/settings?tab=locations" },
          { key: "capacity", label: "Cohorts & capacity", href: "/admin/settings?tab=capacity" },
          { key: "hours", label: "Operating hours", href: "/admin/settings?tab=hours" },
        ]
      : []),
    ...(canStaff ? [{ key: "staff", label: "Staff & roles", href: "/admin/settings?tab=staff" }] : []),
    ...(canSettings ? [{ key: "system", label: "Payments & email", href: "/admin/settings?tab=system" }] : []),
  ];
  const tab = tabs.find((t) => t.key === sp.tab)?.key ?? tabs[0].key;
  const db = getDb();

  return (
    <>
      <PageHeader title="Settings" subtitle="Rules, places, people and connections that shape how Yalla runs." />
      <Tabs tabs={tabs} current={tab} />
      {tab === "policies" ? <Policies /> : null}
      {tab === "locations" ? <Locations /> : null}
      {tab === "capacity" ? <Capacity canPools={can(staff, "capacity.override")} /> : null}
      {tab === "hours" ? <Hours /> : null}
      {tab === "staff" ? <Staff meId={staff.id} /> : null}
      {tab === "system" ? <System /> : null}
    </>
  );

  async function Policies() {
    const policies = await listPolicies(db);
    const groups = [...new Set(policies.map((p) => p.group))];
    const pending = policies.filter((p) => p.needsDecision).length;
    return (
      <div className="space-y-6">
        {pending ? (
          <Notice tone="warning" title={`${pending} policy decision(s) need your input`}>
            Until you save them, Yalla uses the cautious default shown. Nothing about refunds, makeup days, proration or pauses is assumed.
          </Notice>
        ) : (
          <Notice tone="positive" title="All policies have been reviewed" />
        )}
        {groups.map((g) => (
          <Card key={g} title={g} padded={false}>
            <ul className="divide-y divide-ink/6">
              {policies
                .filter((p) => p.group === g)
                .map((p) => (
                  <li key={p.key} className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_22rem]">
                    <div>
                      <p className="flex flex-wrap items-center gap-2 text-[0.92rem] font-medium text-ink">
                        {p.label}
                        {p.needsDecision ? (
                          <Pill tone="warning" icon="alert">
                            Needs your decision
                          </Pill>
                        ) : null}
                      </p>
                      <p className="mt-1 text-[0.82rem] text-ink-soft">{p.help}</p>
                      {p.updatedAt ? (
                        <p className="mt-1 text-[0.72rem] text-ink-soft">
                          Last set by {p.updatedBy} · {fmtDateTime(p.updatedAt)}
                        </p>
                      ) : null}
                    </div>
                    <ActionForm action={policyAction} submit={{ label: p.needsDecision ? "Confirm" : "Save", variant: "secondary" }} className="flex flex-wrap items-end gap-2 [&>div:last-child]:shrink-0">
                      <input type="hidden" name="key" value={p.key} />
                      {"options" in p && p.options ? (
                        <SelectField name="value" label="Choice" defaultValue={String(p.value)} options={p.options as { value: string; label: string }[]} className="min-w-0 flex-1" />
                      ) : typeof p.default === "boolean" ? (
                        <SelectField name="value" label="Choice" defaultValue={String(p.value)} options={[{ value: "false", label: "No" }, { value: "true", label: "Yes" }]} className="min-w-0 flex-1" />
                      ) : (
                        <TextField name="value" label="Value" type="number" defaultValue={String(p.value)} className="min-w-0 flex-1" />
                      )}
                    </ActionForm>
                  </li>
                ))}
            </ul>
          </Card>
        ))}
      </div>
    );
  }

  async function Locations() {
    const { locations } = await locationsCohortsPools(db);
    return (
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-3">
          {locations.map((l) => (
            <Disclosure
              key={l.id}
              label={
                <span className="flex items-center gap-2">
                  {l.name} {l.active ? null : <Pill tone="muted">Inactive</Pill>}
                </span>
              }
            >
              <ActionForm action={locationAction} submit={{ label: "Save location" }}>
                <input type="hidden" name="id" value={l.id} />
                <TextField name="name" label="Name" required defaultValue={l.name} />
                <TextField name="address" label="Address" defaultValue={l.address} />
                <TextArea name="arrivalInstructions" label="Arrival instructions" defaultValue={l.arrivalInstructions} hint="Included in booking confirmations unless a program has its own." />
                <p className="text-[0.75rem] text-ink-soft">Times use {l.timezone}.</p>
                <Checkbox name="active" label="Active" defaultChecked={l.active} />
              </ActionForm>
            </Disclosure>
          ))}
        </div>
        <Card title="Add a location">
          <ActionForm action={locationAction} submit={{ label: "Add location" }} resetOnSuccess>
            <TextField name="name" label="Name" required />
            <TextField name="address" label="Address" />
            <TextArea name="arrivalInstructions" label="Arrival instructions" />
            <Checkbox name="active" label="Active" defaultChecked />
          </ActionForm>
        </Card>
      </div>
    );
  }

  async function Capacity({ canPools }: { canPools: boolean }) {
    const { locations, cohorts, pools } = await locationsCohortsPools(db);
    const usage = await poolUsage(db);
    const locOptions = [{ value: "", label: "Any location" }, ...locations.map((l) => ({ value: l.id, label: l.name }))];
    const CohortFields = ({ c }: { c?: (typeof cohorts)[number] }) => (
      <>
        {c ? <input type="hidden" name="id" value={c.id} /> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField name="name" label="Name" required defaultValue={c?.name} />
          <TextField name="ratio" label="Max caregiver-to-child ratio" defaultValue={c?.ratio} hint="e.g. 1:4" />
          <TextField name="minAgeMonths" label="Youngest age (months)" type="number" defaultValue={c?.minAgeMonths} />
          <TextField name="maxAgeMonths" label="Oldest age (months)" type="number" defaultValue={c?.maxAgeMonths} />
          <TextField name="maxSize" label="Maximum children" type="number" defaultValue={c?.maxSize} />
          <TextField name="sortOrder" label="Display order" type="number" defaultValue={c?.sortOrder ?? 0} />
          <SelectField name="locationId" label="Location" defaultValue={c?.locationId ?? ""} options={locOptions} />
        </div>
        <Checkbox name="active" label="Active" defaultChecked={c?.active ?? true} />
      </>
    );
    return (
      <div className="space-y-8">
        <section>
          <h2 className="mb-3 text-[1rem] font-semibold text-ink">Cohorts</h2>
          {cohorts.some((c) => c.minAgeMonths == null) ? (
            <div className="mb-3">
              <Notice tone="warning">Some cohorts have no age range yet. Add them so staff and families can see which cohort fits a child.</Notice>
            </div>
          ) : null}
          <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
            <div className="space-y-3">
              {cohorts.map((c) => (
                <Disclosure
                  key={c.id}
                  label={
                    <span className="flex flex-wrap items-center gap-2">
                      {c.name}
                      <span className="text-[0.8rem] font-normal text-ink-soft">
                        {c.ratio ? `${c.ratio} · ` : ""}
                        {c.maxSize ? `max ${c.maxSize}` : ""}
                        {c.minAgeMonths != null ? ` · ${c.minAgeMonths}–${c.maxAgeMonths ?? "?"} months` : " · ages not set"}
                      </span>
                      {c.active ? null : <Pill tone="muted">Inactive</Pill>}
                    </span>
                  }
                >
                  <ActionForm action={cohortAction} submit={{ label: "Save cohort" }}>
                    <CohortFields c={c} />
                  </ActionForm>
                </Disclosure>
              ))}
            </div>
            <Card title="Add a cohort">
              <ActionForm action={cohortAction} submit={{ label: "Add cohort" }} resetOnSuccess>
                <CohortFields />
              </ActionForm>
            </Card>
          </div>
        </section>

        <section>
          <h2 className="mb-1 text-[1rem] font-semibold text-ink">Shared capacity pools</h2>
          <p className="mb-3 max-w-2xl text-[0.85rem] text-ink-soft">
            A pool limits every session linked to it that overlaps in time — for example, Club Yalla and Yalla Flex sharing one cohort room. Changing a pool changes live availability immediately.
          </p>
          {!canPools ? (
            <div className="mb-3">
              <Notice tone="info">Editing pools requires the capacity override permission.</Notice>
            </div>
          ) : null}
          <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
            <Card padded={false}>
              <Table head={["Pool", "Capacity", "Upcoming sessions", ""]}>
                {pools.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className="font-medium">{p.name}</span>
                      {p.description ? <span className="block text-[0.78rem] text-ink-soft">{p.description}</span> : null}
                    </td>
                    <td className="tabular-nums">{p.capacity}</td>
                    <td className="tabular-nums text-ink-soft">{usage.get(p.id) ?? 0}</td>
                    <td className="min-w-[14rem]">
                      {canPools ? (
                        <Disclosure label="Edit">
                          <ActionForm
                            action={poolAction}
                            submit={{ label: "Save pool" }}
                            confirm={{ title: "Change shared capacity?", body: "This immediately changes how many spots are available in every linked session.", confirmLabel: "Save pool" }}
                          >
                            <input type="hidden" name="id" value={p.id} />
                            <TextField name="name" label="Name" required defaultValue={p.name} />
                            <TextField name="capacity" label="Capacity" type="number" required defaultValue={p.capacity} />
                            <SelectField name="locationId" label="Location" defaultValue={p.locationId ?? ""} options={locOptions} />
                            <TextField name="description" label="Description" defaultValue={p.description} />
                          </ActionForm>
                        </Disclosure>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </Table>
            </Card>
            {canPools ? (
              <Card title="Add a pool">
                <ActionForm action={poolAction} submit={{ label: "Add pool" }} resetOnSuccess>
                  <TextField name="name" label="Name" required />
                  <TextField name="capacity" label="Capacity" type="number" required />
                  <SelectField name="locationId" label="Location" options={locOptions} />
                  <TextField name="description" label="Description" />
                </ActionForm>
              </Card>
            ) : null}
          </div>
        </section>
      </div>
    );
  }

  async function Hours() {
    const { hours, saved } = await getOperatingHours(db);
    return (
      <div className="max-w-2xl space-y-4">
        {!saved ? <Notice tone="warning" title="Operating hours haven’t been confirmed">These defaults (weekdays 8:00am–4:30pm, including Early Bird) are a starting point. Adjust and save.</Notice> : null}
        <Card>
          <ActionForm action={hoursAction} submit={{ label: "Save hours" }}>
            <p className="text-[0.82rem] text-ink-soft">Leave both times empty for days Yalla is closed. Sessions and closures are managed in the schedule.</p>
            <div className="divide-y divide-ink/6">
              {hours.map((h) => (
                <div key={h.day} className="grid grid-cols-[7rem_1fr_1fr] items-center gap-3 py-2.5">
                  <span className="text-[0.88rem] font-medium">{DAYS[h.day]}</span>
                  <label className="text-[0.75rem] text-ink-soft">
                    Opens
                    <input type="time" name={`open_${h.day}`} defaultValue={h.open ?? ""} className={`${inputCls} mt-1`} />
                  </label>
                  <label className="text-[0.75rem] text-ink-soft">
                    Closes
                    <input type="time" name={`close_${h.day}`} defaultValue={h.close ?? ""} className={`${inputCls} mt-1`} />
                  </label>
                </div>
              ))}
            </div>
          </ActionForm>
        </Card>
      </div>
    );
  }

  async function Staff({ meId }: { meId: string }) {
    const [people, roles] = await Promise.all([staffDirectory(db), allRoles(db)]);
    const roleOptions = roles.map((r) => ({ key: r.key, name: r.name }));
    return (
      <div className="space-y-8">
        <Card title="Invite a staff member">
          <InviteForm action={inviteAction} roles={roleOptions} />
        </Card>
        <Card title={`Staff (${people.length})`} padded={false}>
          <Table head={["Person", "Role", "Status", "Two-step", "Last sign-in", "Actions"]}>
            {people.map(({ u, r }) => (
              <tr key={u.id}>
                <td>
                  <span className="font-medium">{u.name}</span>
                  {u.id === meId ? (
                    <span className="ml-2">
                      <Pill tone="info">You</Pill>
                    </span>
                  ) : null}
                  <span className="block text-[0.78rem] text-ink-soft">{u.email}</span>
                </td>
                <td className="min-w-[13rem]">
                  <ActionForm action={roleAction} submit={{ label: "Change", variant: "ghost" }} className="flex items-end gap-1">
                    <input type="hidden" name="staffId" value={u.id} />
                    <SelectField name="roleKey" label="Role" defaultValue={r.key} options={roles.map((x) => ({ value: x.key, label: x.name }))} />
                  </ActionForm>
                </td>
                <td>
                  {u.status === "disabled" ? (
                    <Pill tone="muted" icon="x">
                      Disabled
                    </Pill>
                  ) : !u.passwordHash ? (
                    <Pill tone="info" icon="clock">
                      Invited
                    </Pill>
                  ) : u.lockedUntil && u.lockedUntil > new Date() ? (
                    <Pill tone="warning" icon="alert">
                      Locked
                    </Pill>
                  ) : (
                    <Pill tone="positive" icon="check">
                      Active
                    </Pill>
                  )}
                </td>
                <td>{u.mfaEnabled ? <Pill tone="positive" icon="check">On</Pill> : <Pill tone={r.key === "owner" ? "warning" : "muted"} icon="minus">Off</Pill>}</td>
                <td className="whitespace-nowrap text-ink-soft">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "Never"}</td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    {u.id !== meId ? (
                      u.status === "active" ? (
                        <SmallAction action={statusAction} fields={{ staffId: u.id, status: "disabled" }} label="Disable" variant="ghost" confirmText={`Disable ${u.name}? They’ll be signed out everywhere.`} />
                      ) : (
                        <SmallAction action={statusAction} fields={{ staffId: u.id, status: "active" }} label="Re-enable" />
                      )
                    ) : null}
                    {!u.passwordHash && u.status === "active" ? <SmallAction action={resendInviteAction} fields={{ staffId: u.id }} label="Resend invite" /> : null}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </Card>

        <section>
          <h2 className="mb-1 text-[1rem] font-semibold text-ink">Roles & permissions</h2>
          <p className="mb-4 max-w-2xl text-[0.85rem] text-ink-soft">
            Permissions are enforced on the server, not just hidden in the interface. For example, educators can see allergies and pickup contacts without seeing billing.
          </p>
          <div className="space-y-3">
            {roles.map((role) => (
              <Disclosure
                key={role.id}
                label={
                  <span className="flex flex-wrap items-center gap-2">
                    {role.name}
                    <span className="text-[0.8rem] font-normal text-ink-soft">
                      {role.key === "owner" ? "Full access" : `${role.permissions.length} permissions`} · {people.filter((p) => p.r.id === role.id).length} people
                    </span>
                  </span>
                }
              >
                {role.description ? <p className="mb-3 text-[0.85rem] text-ink-soft">{role.description}</p> : null}
                {role.key === "owner" ? (
                  <Notice tone="info">The owner role always has every permission so Yalla can never be locked out.</Notice>
                ) : (
                  <ActionForm action={permissionsAction} submit={{ label: `Save ${role.name} permissions` }}>
                    <input type="hidden" name="roleId" value={role.id} />
                    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                      {PERMISSION_GROUPS.map((g) => (
                        <fieldset key={g.group}>
                          <legend className="mb-1.5 text-[0.72rem] font-semibold tracking-[0.06em] text-ink-soft uppercase">{g.group}</legend>
                          <div className="space-y-1.5">
                            {g.items.map((i) => (
                              <label key={i.key} className="flex items-start gap-2 text-[0.84rem]">
                                <input type="checkbox" name="permissions" value={i.key} defaultChecked={role.permissions.includes(i.key)} className="mt-0.5 h-4 w-4 rounded border-ink/30" />
                                <span>{i.label}</span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      ))}
                    </div>
                  </ActionForm>
                )}
              </Disclosure>
            ))}
          </div>
          <div className="mt-4 max-w-xl">
            <Card title="Create a role">
              <ActionForm action={createRoleAction} submit={{ label: "Create role" }} resetOnSuccess>
                <TextField name="name" label="Role name" required />
                <TextField name="description" label="Description" />
                <SelectField name="copyFrom" label="Start from" options={[{ value: "", label: "Dashboard only" }, ...roles.filter((r) => r.key !== "owner").map((r) => ({ value: r.id, label: `Copy ${r.name}` }))]} />
              </ActionForm>
            </Card>
          </div>
        </section>
      </div>
    );
  }

  async function System() {
    const st = systemStatus();
    return (
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Payments">
          <div className="space-y-3 text-[0.88rem]">
            <p>
              Provider:{" "}
              <Pill tone={st.payments.provider === "test" ? "info" : st.payments.live ? "critical" : "positive"} icon="dot">
                {st.payments.provider === "test" ? "Built-in test checkout" : st.payments.live ? "Stripe — LIVE" : "Stripe — test mode"}
              </Pill>
            </p>
            {st.payments.problem ? <Notice tone="warning">{st.payments.problem}</Notice> : null}
            <p className="text-ink-soft">
              To take real payments: create a Stripe account, add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET (webhook endpoint: /api/webhooks/stripe), test with Stripe’s test keys, then switch to live keys and set PAYMENTS_LIVE_ENABLED=true.
            </p>
          </div>
        </Card>
        <Card title="Email">
          <div className="space-y-3 text-[0.88rem]">
            <p>
              Mode: <Pill tone={st.notifications === "test" ? "info" : "warning"} icon="dot">{st.notifications === "test" ? "Test — captured, not sent" : "Live — delivering"}</Pill>
            </p>
            <p className="text-ink-soft">
              History and templates live in{" "}
              <Link className="text-blue hover:underline" href="/admin/communications">
                Messages
              </Link>
              .
            </p>
          </div>
        </Card>
        <Card title="Configuration checklist" className="xl:col-span-2" padded={false}>
          <Table head={["Setting", "Variable", "Status"]} dense>
            {st.env.map((e) => (
              <tr key={e.key}>
                <td>
                  {e.label}
                  {e.note ? <span className="block text-[0.75rem] text-[#8a5212]">{e.note}</span> : null}
                </td>
                <td className="font-mono text-[0.78rem] text-ink-soft">{e.key}</td>
                <td>{e.ok ? <Pill tone="positive" icon="check">Set</Pill> : <Pill tone={e.required ? "critical" : "muted"} icon={e.required ? "alert" : "minus"}>{e.required ? "Missing" : "Not set"}</Pill>}</td>
              </tr>
            ))}
          </Table>
          <p className="px-5 py-3 text-[0.75rem] text-ink-soft">Only whether each value is present is shown — secrets are never displayed.</p>
        </Card>
      </div>
    );
  }
}

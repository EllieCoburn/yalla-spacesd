import { Checkbox, TextField } from "@/components/admin/forms";
import type { guardians } from "@/lib/db/schema";

/** Shared guardian fields. Access flags default off for added guardians — never auto-granted. */
export function GuardianFields({ g }: { g?: typeof guardians.$inferSelect }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField name="firstName" label="First name" required defaultValue={g?.firstName} />
        <TextField name="lastName" label="Last name" required defaultValue={g?.lastName} />
        <TextField name="email" label="Email (their own login)" type="email" required defaultValue={g?.email} />
        <TextField name="phone" label="Mobile" type="tel" defaultValue={g?.phone} />
        <TextField name="relationship" label="Relationship" defaultValue={g?.relationship} hint="e.g. Parent, Grandparent, Nanny" />
      </div>
      <fieldset className="space-y-2 rounded-lg border border-ink/10 p-3">
        <legend className="px-1 text-[0.78rem] font-medium text-ink">What this adult can access</legend>
        <Checkbox name="portalAccess" label="Family Portal sign-in" defaultChecked={g ? g.portalAccess : true} />
        <Checkbox name="canBook" label="Make and change bookings" defaultChecked={g ? g.canBook : true} />
        <Checkbox name="canViewBilling" label="See invoices, payments and receive receipts" defaultChecked={g?.canViewBilling ?? false} />
        <Checkbox name="canViewSensitive" label="See and edit children’s medical and care information" defaultChecked={g?.canViewSensitive ?? false} />
      </fieldset>
    </>
  );
}

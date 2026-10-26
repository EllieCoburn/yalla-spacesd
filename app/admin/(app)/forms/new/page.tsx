import { LEGAL_NOTE } from "@/components/admin/forms-admin/labels";
import { ActionForm, Checkbox, SelectField, TextArea, TextField } from "@/components/admin/forms";
import { Card, Notice, PageHeader } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createTemplateAction } from "../actions";

export const metadata = { title: "New form" };

export default async function NewFormPage() {
  await requirePermission("forms.manage");
  return (
    <>
      <PageHeader title="New form or waiver" back={{ href: "/admin/forms", label: "Forms & waivers" }} />
      <div className="grid max-w-5xl gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <ActionForm action={createTemplateAction} submit={{ label: "Create & publish version 1" }}>
            <TextField name="title" label="Title" required placeholder="e.g. Weekend & evening care waiver" />
            <TextField name="description" label="Short description (shown to families)" />
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField
                name="kind"
                label="Type"
                options={[
                  { value: "form", label: "Form" },
                  { value: "waiver", label: "Waiver (signature required)" },
                  { value: "policy", label: "Policy / agreement" },
                  { value: "upload", label: "Document upload" },
                ]}
              />
              <SelectField
                name="scopeUnit"
                label="Completed"
                options={[
                  { value: "child", label: "Once per child" },
                  { value: "family", label: "Once per family" },
                ]}
              />
              <SelectField
                name="enforcement"
                label="Requirement level"
                defaultValue="before_attendance"
                options={[
                  { value: "blocks_booking", label: "Required to book (blocks booking)" },
                  { value: "before_attendance", label: "Required before attending" },
                  { value: "informational", label: "Informational" },
                ]}
              />
              <SelectField
                name="frequency"
                label="How often"
                options={[
                  { value: "once", label: "Once" },
                  { value: "periodic", label: "Renewed periodically" },
                  { value: "per_booking", label: "For each booking" },
                ]}
              />
              <TextField name="validForMonths" label="Renew every (months)" type="number" hint="Only for periodic forms." />
            </div>
            <Checkbox name="requiresSignature" label="Requires a guardian’s signature" hint="Always on for waivers." />
            <TextArea name="body" label="Form text" rows={10} required placeholder="[Placeholder — replace with Yalla’s approved language before families sign.]" />
          </ActionForm>
        </Card>
        <div className="space-y-4">
          <Notice tone="warning" title="Approved language needed">
            {LEGAL_NOTE}
          </Notice>
          <Notice tone="info" title="Versions are permanent">
            Once published, a version can’t be edited. Changing the text publishes a new version; previously signed copies are kept exactly as signed.
          </Notice>
          <Notice tone="neutral" title="Next">After creating the form, choose who it’s required for (every family, a program, Club Yalla members, a family, a child or an event).</Notice>
        </div>
      </div>
    </>
  );
}

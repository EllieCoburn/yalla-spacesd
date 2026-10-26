import { notFound } from "next/navigation";
import { TemplateEditor } from "@/components/admin/billing/TemplateEditor";
import { PageHeader, Pill } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/staff";
import { getDb } from "@/lib/db";
import { DEFAULT_TEMPLATES, SAMPLE_VARIABLES, TEMPLATE_VARIABLES, templateFor, type TemplateKey } from "@/lib/notify";

export const metadata = { title: "Edit template" };

export default async function TemplatePage({ params }: { params: Promise<{ key: string }> }) {
  const staff = await requirePermission("communications.view");
  const { key } = await params;
  if (!(key in DEFAULT_TEMPLATES)) notFound();
  const t = await templateFor(getDb(), key as TemplateKey);
  const samples = Object.fromEntries(TEMPLATE_VARIABLES[key as TemplateKey].map((v) => [v, SAMPLE_VARIABLES[v] ?? v]));
  return (
    <>
      <PageHeader
        back={{ href: "/admin/communications?tab=templates", label: "Templates" }}
        title={t.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Pill tone="neutral">Essential service message</Pill>
            <span>Sent to {t.audience === "billing" ? "billing contacts" : t.audience === "staff" ? "staff" : "guardians with portal access"}.</span>
          </span>
        }
      />
      <TemplateEditor
        templateKey={key}
        initialSubject={t.subject}
        initialBody={t.body}
        variables={TEMPLATE_VARIABLES[key as TemplateKey]}
        samples={samples}
        canEdit={can(staff, "communications.manage")}
        customized={t.subject !== DEFAULT_TEMPLATES[key as TemplateKey].subject || t.body !== DEFAULT_TEMPLATES[key as TemplateKey].body}
      />
    </>
  );
}

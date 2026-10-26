import { NewFamilyForm } from "@/components/admin/families/NewFamilyForm";
import { Card, PageHeader } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createFamilyAction } from "../actions";

export const metadata = { title: "Add family" };

export default async function NewFamilyPage() {
  await requirePermission("families.manage");
  return (
    <>
      <PageHeader title="Add a family" subtitle="Start with the primary guardian. You can add children, other guardians and contacts next." back={{ href: "/admin/families", label: "Families" }} />
      <div className="max-w-3xl">
        <Card>
          <NewFamilyForm action={createFamilyAction} />
        </Card>
      </div>
    </>
  );
}

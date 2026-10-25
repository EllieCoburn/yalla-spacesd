import { PageHeader, Notice, LinkButton } from "@/components/admin/ui";
import { PERMISSION_ITEMS } from "@/lib/auth/permissions";

export default async function Forbidden({ searchParams }: { searchParams: Promise<{ need?: string }> }) {
  const { need } = await searchParams;
  const label = PERMISSION_ITEMS.find((i) => i.key === need)?.label;
  return (
    <>
      <PageHeader title="You don’t have access to this page" />
      <Notice tone="warning" title="Permission needed">
        {label ? `This page requires “${label}”.` : "Your role doesn’t include this area."} An owner can change role permissions in Settings → Staff & roles.
      </Notice>
      <div className="mt-6">
        <LinkButton href="/admin">Back to Today</LinkButton>
      </div>
    </>
  );
}

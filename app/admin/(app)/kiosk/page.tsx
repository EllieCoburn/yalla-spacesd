import { ActionForm } from "@/components/admin/forms";
import { Card, Notice, PageHeader } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { endKioskAction, startKioskAction } from "./actions";

export const metadata = { title: "Check-in kiosk" };

/** Staff open the lobby check-in screen on the kiosk from here. It's never public. */
export default async function KioskAdminPage() {
  await requirePermission("attendance.manage");
  return (
    <>
      <PageHeader title="Check-in kiosk" subtitle="Family check-in codes for camp, weekend sessions and Happenings" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Open the check-in screen on this device">
          <div className="space-y-4 text-[0.9rem]">
            <p>Do this on the lobby kiosk each morning. The screen stays open until midnight, and you can sign out of Admin afterwards: families can only use the check-in screen, nothing else.</p>
            <p>Families enter their 4-digit check-in code, then tap which children are arriving or leaving. Check-ins and check-outs appear on the Roster straight away, and late pickups are charged as usual.</p>
            <ActionForm action={startKioskAction} submit={{ label: "Open the check-in screen", pending: "Opening…" }}>
              <span />
            </ActionForm>
          </div>
        </Card>
        <Card title="Close it everywhere">
          <div className="space-y-4 text-[0.9rem]">
            <p>Ends every open check-in screen now, for example if the kiosk was left open on another device.</p>
            <ActionForm action={endKioskAction} submit={{ label: "Close the check-in screen", variant: "secondary" }} confirm={{ title: "Close the check-in screen on every device?", confirmLabel: "Close it" }}>
              <span />
            </ActionForm>
          </div>
        </Card>
      </div>
      <div className="mt-6">
        <Notice title="Which programs use codes">
          Every program except Yalla Flex and Club Yalla, which check in through Brightwheel. Each family’s code is on their family page, in their Family Portal, in the Camp Yalla welcome email and in the reminder the evening before.
        </Notice>
      </div>
    </>
  );
}

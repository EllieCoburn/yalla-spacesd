import { Card, PageHeader } from "@/components/admin/ui";
import { ProgramForm } from "@/components/admin/programs/ProgramForm";
import { requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { referenceData } from "@/lib/admin/queries/programs";
import { BOOKING_MODES, BOOKING_UNITS, PARENT_PRESENCE, PRICE_UNITS, PROGRAM_KINDS, SERIES_MODES } from "@/lib/ops/programs";

export const metadata = { title: "New program" };

export default async function NewProgramPage() {
  await requirePermission("programs.manage");
  const ref = await referenceData(getDb());
  return (
    <>
      <PageHeader title="New program" subtitle="Starts as a draft. Add pricing, required forms and a schedule, then publish." back={{ href: "/admin/programs", label: "Programs" }} />
      <Card>
        <ProgramForm
          canEdit
          locations={ref.locations.map((l) => ({ value: l.id, label: l.name }))}
          options={{ kinds: PROGRAM_KINDS, presence: PARENT_PRESENCE, units: BOOKING_UNITS, modes: BOOKING_MODES, seriesModes: SERIES_MODES, priceUnits: PRICE_UNITS }}
          program={{ locationId: ref.locations[0]?.id }}
        />
      </Card>
    </>
  );
}

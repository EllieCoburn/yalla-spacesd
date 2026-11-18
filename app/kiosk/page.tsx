import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Mark } from "@/components/brand/Mark";
import { getDb, isDbConfigured } from "@/lib/db";
import { KIOSK_COOKIE, kioskSessionValid } from "@/lib/ops/checkin";
import { KioskScreen } from "./KioskScreen";

export const metadata: Metadata = { title: "Check in", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** The lobby check-in screen. Only works on a device where staff opened it from Admin today. */
export default async function KioskPage() {
  const open = isDbConfigured() && (await kioskSessionValid(getDb(), (await cookies()).get(KIOSK_COOKIE)?.value));
  return (
    <main id="main" className="flex min-h-dvh flex-col bg-chalk">
      <header className="flex items-center justify-between px-8 pt-8">
        <Mark name="wordmark" className="h-10 w-auto text-blue" />
        <p className="eyebrow text-[0.65rem] text-ink-soft">Family check-in</p>
      </header>
      {open ? (
        <KioskScreen />
      ) : (
        <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-6 text-center">
          <h1 className="display text-[2.4rem]">This screen is closed.</h1>
          <p className="mt-4 text-ink-soft">Team Yalla can open it from Admin, Check-in kiosk.</p>
        </div>
      )}
    </main>
  );
}

import type { familyPortalData } from "@/lib/ops/public-booking";
import { addDaysISO, todayLA, weekdayOf, zonedDateTime } from "@/lib/time";

/**
 * While true, anyone can open the Family Portal without signing in and sees it filled with a
 * made-up sample family. Real families who sign in still see only their own records, and the
 * preview never reads or changes real data. Set to false before launch so the portal needs sign-in.
 */
export const PORTAL_OPEN_PREVIEW = true;

export type PortalData = Awaited<ReturnType<typeof familyPortalData>>;

export const previewGuardian = { firstName: "Jordan", familyName: "Sample family" };

/** A synthetic family for the open preview. Dates are relative to today so it always looks current. */
export function samplePortalData(): PortalData {
  const today = todayLA();
  const at = (days: number, time: string) => zonedDateTime(addDaysISO(today, days), time).toISOString();
  const nextWeekday = (weekday: number) => {
    let d = 1;
    while (weekdayOf(addDaysISO(today, d)) !== weekday) d++;
    return d;
  };
  const sat = nextWeekday(6);
  const fri = nextWeekday(5);
  const booking = (id: string, days: number, start: string, end: string, title: string, child: string, ref: string) => ({
    itemId: id,
    bookingId: `b-${id}`,
    reference: ref,
    bookingStatus: "confirmed",
    itemStatus: "confirmed",
    program: title.split(" · ")[0],
    title,
    localDate: addDaysISO(today, days),
    startsAt: at(days, start),
    endsAt: at(days, end),
    child,
    canCancel: true,
    cancelNote: "Free to cancel until 48 hours before.",
  });
  const form = (templateId: string, title: string, childId: string | null, forChild: string | null, state: "complete" | "missing" | "unsigned") => ({
    templateId,
    title,
    kind: "agreement",
    enforcement: "required",
    perChild: childId != null,
    childId,
    state,
    submissionId: null,
    signedAt: state === "complete" ? new Date(`${addDaysISO(today, -40)}T12:00:00Z`) : null,
    expiresOn: null,
    forChild,
    requiresSignature: true,
    body: "Sample form text. The real wording appears here once Yalla adds it.",
    version: 1,
    completableOnline: true,
  });

  return {
    children: [
      { id: "preview-ava", firstName: "Ava", lastName: "Sample", preferredName: null, birthDate: addDaysISO(today, -365 * 3 - 60), cohort: "Sprouts", care: { allergies: "None known", medicalNotes: "", careNotes: "Loves the sandbox.", updatedAt: null } },
      { id: "preview-leo", firstName: "Leo", lastName: "Sample", preferredName: null, birthDate: addDaysISO(today, -365 * 2 - 120), cohort: null, care: { allergies: "", medicalNotes: "", careNotes: "", updatedAt: null } },
    ],
    memberships: [{ id: "preview-m", child: "Ava", weekdays: [1, 2, 3, 4, 5], dayLength: "full", startsOn: addDaysISO(today, -120), endsOn: null, status: "active" }],
    upcoming: [
      booking("p1", sat, "09:00", "12:00", "Yalla Weekends · AM play session · 18 months – 4 years", "Leo", "YL-SAMPLE1"),
      booking("p2", fri, "17:00", "21:00", "Yalla After Hours · 18 months – 4 years", "Leo", "YL-SAMPLE2"),
    ].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    past: [{ ...booking("p0", -12, "08:30", "16:30", "Yalla Flex · Full day", "Leo", "YL-SAMPLE0"), canCancel: false }],
    forms: [
      form("preview-f1", "Enrollment agreement", null, null, "complete"),
      form("preview-f2", "Emergency contacts", "preview-leo", "Leo", "missing"),
      form("preview-f3", "Photo permission", "preview-ava", "Ava", "unsigned"),
    ],
    billing: {
      outstandingCents: 6000,
      creditCents: 0,
      invoices: [
        { id: "preview-i1", number: "INV-SAMPLE-2", description: "Yalla Weekends · AM play session", issuedAt: `${addDaysISO(today, -2)}T18:00:00Z`, status: "open", totalCents: 6000, paidCents: 0, refundedCents: 0, balanceCents: 6000 },
        { id: "preview-i0", number: "INV-SAMPLE-1", description: "Club Yalla membership", issuedAt: `${addDaysISO(today, -27)}T18:00:00Z`, status: "paid", totalCents: 180000, paidCents: 180000, refundedCents: 0, balanceCents: 0 },
      ],
    },
  };
}

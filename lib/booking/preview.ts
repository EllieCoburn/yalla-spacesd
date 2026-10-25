/**
 * Preview booking provider — SAMPLE DATA ONLY.
 *
 * Generates a believable calendar so the booking experience can be designed and
 * reviewed before the real backend is connected. Times, capacities and spaces
 * here are placeholders, not Yalla's schedule. Prices are intentionally null.
 */
import { addDays, format, getDay, startOfDay } from "date-fns";
import type { Availability, AvailabilityQuery, Child, Family, ProgramKind, RequiredForm, Session } from "./types";

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

const at = (day: Date, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

type Template = { kind: ProgramKind; title: string; start: string; end: string; capacity: number; minMonths: number; maxMonths: number };

const templates: Record<ProgramKind, Template | null> = {
  membership: null,
  nature: null,
  private_event: null,
  happening: { kind: "happening", title: "Happening · Pop-up workshop", start: "10:00", end: "11:30", capacity: 14, minMonths: 12, maxMonths: 60 },
  drop_in: { kind: "drop_in", title: "Flex day", start: "08:30", end: "16:30", capacity: 6, minMonths: 4, maxMonths: 60 },
  weekend: { kind: "weekend", title: "Weekend morning", start: "09:00", end: "12:30", capacity: 10, minMonths: 12, maxMonths: 60 },
  parents_night: { kind: "parents_night", title: "After Hours evening", start: "17:30", end: "21:00", capacity: 12, minMonths: 12, maxMonths: 60 },
  camp: { kind: "camp", title: "Camp day", start: "08:30", end: "16:30", capacity: 10, minMonths: 24, maxMonths: 60 },
};

export type PreviewSession = Session & { kind: ProgramKind; title: string };

export function previewSessions(q: AvailabilityQuery): PreviewSession[] {
  const out: PreviewSession[] = [];
  const from = startOfDay(new Date(q.from + "T00:00:00"));
  const to = startOfDay(new Date(q.to + "T00:00:00"));
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const dow = getDay(d);
    const key = format(d, "yyyy-MM-dd");
    const weekIndex = Math.floor((d.getTime() - new Date("2026-01-04T00:00:00").getTime()) / (7 * 864e5));
    const push = (t: Template, extra?: Partial<PreviewSession>) => {
      const r = hash(key + t.kind);
      const taken = Math.min(t.capacity, Math.floor(r * (t.capacity + 3)));
      out.push({
        id: `${t.kind}-${key}`,
        programId: t.kind,
        kind: t.kind,
        title: t.title,
        startsAt: at(d, t.start),
        endsAt: at(d, t.end),
        ages: { minMonths: t.minMonths, maxMonths: t.maxMonths },
        capacity: t.capacity,
        taken,
        price: null,
        status: "open",
        ...extra,
      });
    };
    const isCampWeek = weekIndex % 6 === 3;
    if (dow >= 1 && dow <= 5) {
      if (isCampWeek) push(templates.camp!, { groupId: `camp-w${weekIndex}`, title: "Camp Yalla · Little Builders week" });
      else push(templates.drop_in!);
    }
    if (dow === 6) push(templates.weekend!);
    if (dow === 5 && weekIndex % 2 === 0) push(templates.parents_night!);
    if (dow === 0 && weekIndex % 2 === 1) push(templates.happening!);
  }
  return out.filter((s) => {
    if (q.kinds?.length && !q.kinds.includes(s.kind)) return false;
    return true;
  });
}

export function availabilityFor(s: Session, childAgeMonths?: number): Availability {
  if (childAgeMonths != null && (childAgeMonths < s.ages.minMonths || childAgeMonths > s.ages.maxMonths)) {
    return { state: "ineligible", reason: `For ages ${formatAgeRange(s.ages.minMonths, s.ages.maxMonths)}` };
  }
  const remaining = s.capacity - s.taken;
  if (remaining <= 0) return { state: "full", waitlist: true };
  if (remaining <= 2) return { state: "limited", remaining };
  return { state: "open", remaining };
}

export function formatAgeRange(min: number, max: number) {
  const f = (m: number) => (m < 24 ? `${m} mo` : `${Math.floor(m / 12)} yr`);
  return `${f(min)} – ${f(max)}`;
}

export function ageInMonths(birthDate: string, on = new Date()) {
  const b = new Date(birthDate + "T00:00:00");
  return (on.getFullYear() - b.getFullYear()) * 12 + (on.getMonth() - b.getMonth()) - (on.getDate() < b.getDate() ? 1 : 0);
}

/** A sample family for the portal preview. Not real people. */
export const sampleFamily: Family = {
  id: "fam_preview",
  name: "The Sample Family",
  guardians: [{ id: "g1", firstName: "Alex", lastName: "Sample", email: "alex@example.com", isPrimary: true }],
  children: [
    { id: "c1", firstName: "Juniper", lastName: "Sample", birthDate: "2023-03-14", allergies: "None noted" },
    { id: "c2", firstName: "Theo", lastName: "Sample", birthDate: "2025-06-02" },
  ] satisfies Child[],
};

export const sampleForms: RequiredForm[] = [
  { id: "f1", title: "Enrollment agreement", status: "approved" },
  { id: "f2", title: "Emergency contacts & authorized pick-up", status: "submitted" },
  { id: "f3", title: "Health & immunization record", childId: "c1", status: "approved" },
  { id: "f4", title: "Health & immunization record", childId: "c2", status: "missing" },
  { id: "f5", title: "Photo & media preferences", status: "missing" },
];

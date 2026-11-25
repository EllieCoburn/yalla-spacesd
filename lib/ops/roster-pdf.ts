/**
 * The day roster PDF: every child expected on a day (each camp age group, Happenings, Flex and the
 * rest), with their parents, the parents' phone numbers, allergies and medications, so whoever is
 * leading the day has it all on one printed page at a glance. US Letter, landscape, in Yalla's brand.
 *
 * Staff only, and only for roles that can see both contact details and care information.
 */
import fontkit from "@pdf-lib/fontkit";
import { asc, desc, inArray } from "drizzle-orm";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Executor } from "@/lib/db";
import { children, guardians } from "@/lib/db/schema";
import type { Permission } from "@/lib/auth/permissions";
import { clean as cleanFor, loadAssets, wrap } from "@/lib/billing/invoice-pdf";
import { flexGroupForBooking } from "@/lib/booking/flex";
import { campGroupFor } from "@/content/camp-what-to-bring";
import { roster } from "./attendance";
import { daySessions } from "./dashboard";
import { fmtDate, fmtTime } from "@/lib/time";

const W = 792; // 11in, landscape
const H = 612; // 8.5in
const M = 36; // 0.5in margins
const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const INK = hex("#292c45");
const SOFT = hex("#5a5d74");
const BLUE = hex("#6065f2");
const MIST = hex("#e7e5f1");
const LINE = hex("#d6cfc3");
const OXBLOOD = hex("#673e46");
const ALERT = hex("#f6e9e9");

export type RosterRow = {
  name: string;
  preferredName: string | null;
  age: string;
  birthDate: string;
  parents: { name: string; phone: string | null }[];
  allergies: string | null;
  medications: string | null;
  note: string | null;
};
export type RosterGroup = { title: string; detail: string; rows: RosterRow[] };

const blank = (s: string | null | undefined) => !s || !s.trim() || /^(none|n\/?a|no|nope|-|no allergies|no medications|none known)\.?$/i.test(s.trim());

/** The groups on a day: one per session with anyone expected, in start-time order. */
export async function dayRosterGroups(db: Executor, date: string, opts: { programId?: string; sessionId?: string; perms: readonly Permission[] }): Promise<{ program: string | null; groups: RosterGroup[] }> {
  const list = (await daySessions(db, { date, programId: opts.programId })).filter((l) => l.session.status !== "cancelled" && (!opts.sessionId || l.session.id === opts.sessionId));
  const groups: RosterGroup[] = [];
  const programNames = new Set<string>();
  for (const l of list) {
    const r = await roster(db, l.session.id, opts.perms);
    const kids = r.children.filter((c) => c.expected || c.attendance?.status === "checked_in" || c.attendance?.status === "checked_out");
    if (!kids.length) continue;
    const familyIds = [...new Set(kids.map((c) => c.familyId))];
    const born = new Map((await db.select({ id: children.id, birthDate: children.birthDate }).from(children).where(inArray(children.id, kids.map((c) => c.childId)))).map((k) => [k.id, k.birthDate]));
    const gs = await db.select().from(guardians).where(inArray(guardians.familyId, familyIds)).orderBy(desc(guardians.isPrimary), asc(guardians.createdAt));
    const kind = r.program?.kind;
    const ageGroup =
      kind === "camp" ? campGroupFor(r.session.minAgeMonths)?.label : kind === "drop_in" ? (({ cohort, label }) => `${cohort} · ${label}`)(flexGroupForBooking(r.session)) : null;
    const programName = r.program?.name ?? "Session";
    programNames.add(programName);
    const title = r.session.title && !ageGroup ? r.session.title : [programName, ageGroup].filter(Boolean).join(" · ");
    groups.push({
      title,
      detail: `${fmtTime(r.session.startsAt)} – ${fmtTime(r.session.endsAt)} · ${kids.length} ${kids.length === 1 ? "child" : "children"}`,
      rows: kids
        .map((c) => ({
          name: c.name,
          preferredName: c.preferredName && c.preferredName !== c.name.split(" ")[0] ? c.preferredName : null,
          age: c.age,
          birthDate: born.get(c.childId) ?? "",
          parents: gs.filter((g) => g.familyId === c.familyId).map((g) => ({ name: `${g.firstName} ${g.lastName}`.trim(), phone: g.phone })),
          allergies: blank(c.care?.allergies) ? null : c.care!.allergies!.trim(),
          medications: blank(c.care?.medicalNotes) ? null : c.care!.medicalNotes!.trim(),
          note: [c.extras.length ? c.extras.join(", ") : null, c.notExpectedReason].filter(Boolean).join(" · ") || null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
  }
  return { program: programNames.size === 1 ? [...programNames][0] : null, groups };
}

/** Columns across the 720pt-wide page. */
const COLS = [
  { key: "child", label: "Child", w: 160 },
  { key: "parents", label: "Parents", w: 150 },
  { key: "phone", label: "Phone", w: 100 },
  { key: "allergies", label: "Allergies", w: 160 },
  { key: "meds", label: "Medications", w: 150 },
] as const;
const PAD = 6;

export async function dayRosterPdf(
  db: Executor,
  date: string,
  opts: { programId?: string; sessionId?: string; perms: readonly Permission[]; printedBy: string; now?: Date },
): Promise<{ bytes: Uint8Array; filename: string; children: number }> {
  const { program, groups } = await dayRosterGroups(db, date, opts);
  const a = await loadAssets();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const serif = await pdf.embedFont(a.lora, { subset: true });
  const sans = await pdf.embedFont(a.sans, { subset: true });
  const logo = await pdf.embedPng(a.logo);
  const heading = program ? `${program} roster` : "Day roster";
  pdf.setTitle(`${heading} · ${fmtDate(date, "EEEE, MMMM d, yyyy")}`);
  pdf.setAuthor("Yalla");

  const t = (page: PDFPage, s: string, x: number, y: number, size: number, font: PDFFont, color = INK) => page.drawText(cleanFor(s, font), { x, y, size, font, color });
  const lines = (s: string, font: PDFFont, size: number, w: number) => s.split(/\n+/).flatMap((p) => wrap(cleanFor(p, font), font, size, w));
  const printed = (opts.now ?? new Date()).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const total = groups.reduce((n, g) => n + g.rows.length, 0);

  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;
  const newPage = (first: boolean) => {
    page = pdf.addPage([W, H]);
    pages.push(page);
    y = H - M;
    const logoH = first ? 40 : 24;
    const logoW = (logo.width / logo.height) * logoH;
    page.drawImage(logo, { x: W - M - logoW, y: y - logoH + 6, width: logoW, height: logoH });
    if (first) {
      t(page, heading, M, y - 22, 24, serif);
      t(page, `${fmtDate(date, "EEEE, MMMM d, yyyy")}  ·  ${total} ${total === 1 ? "child" : "children"}`, M, y - 42, 11, sans, SOFT);
      y -= 64;
    } else {
      t(page, `${heading} · ${fmtDate(date, "EEEE, MMMM d")} (continued)`, M, y - 14, 11, sans, SOFT);
      y -= 32;
    }
  };
  const header = () => {
    let x = M;
    for (const c of COLS) {
      t(page, c.label.toUpperCase(), x + PAD, y - 11, 7.5, sans, SOFT);
      x += c.w;
    }
    y -= 17;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: INK });
  };
  const groupTitle = (g: RosterGroup, cont = false) => {
    page.drawRectangle({ x: M, y: y - 26, width: W - 2 * M, height: 26, color: MIST });
    t(page, g.title + (cont ? " (continued)" : ""), M + PAD, y - 18, 13, serif);
    const d = cleanFor(g.detail, sans);
    t(page, d, W - M - PAD - sans.widthOfTextAtSize(d, 9.5), y - 17, 9.5, sans, SOFT);
    y -= 26;
    header();
  };

  newPage(true);
  if (!groups.length) {
    t(page, "No children are booked for this day.", M, y - 20, 12, sans, SOFT);
  }
  const FOOT = M + 18;
  for (const g of groups) {
    // Keep a group's title with at least its first child.
    if (y - 26 - 17 - 40 < FOOT) newPage(false);
    groupTitle(g);
    for (const r of g.rows) {
      const childLines = lines(r.name, serif, 11.5, COLS[0].w - 2 * PAD);
      const subLines = [r.preferredName ? `Goes by ${r.preferredName}` : null, [r.birthDate ? `Born ${fmtDate(r.birthDate, "MMM d, yyyy")}` : null, r.age].filter(Boolean).join(" · ")]
        .filter((x): x is string => !!x)
        .flatMap((x) => lines(x, sans, 8.5, COLS[0].w - 2 * PAD));
      const noteLines = r.note ? lines(r.note, sans, 8, COLS[0].w - 2 * PAD) : [];
      const parentBlocks = (r.parents.length ? r.parents : [{ name: "No parent on file", phone: null }]).map((p) => ({
        name: lines(p.name, sans, 9.5, COLS[1].w - 2 * PAD),
        phone: p.phone ? lines(p.phone, sans, 9.5, COLS[2].w - 2 * PAD) : ["—"],
      }));
      const allergyLines = r.allergies ? lines(r.allergies, sans, 9.5, COLS[3].w - 2 * PAD - 4) : ["None reported"];
      const medLines = r.medications ? lines(r.medications, sans, 9.5, COLS[4].w - 2 * PAD) : ["None reported"];
      const LH = 12.5;
      const childH = childLines.length * 14 + subLines.length * 11 + noteLines.length * 10;
      const parentsH = parentBlocks.reduce((h, b) => h + Math.max(b.name.length, b.phone.length) * LH + 3, 0);
      const h = Math.max(childH, parentsH, allergyLines.length * LH, medLines.length * LH) + 2 * PAD + 2;
      if (y - h < FOOT) {
        newPage(false);
        groupTitle(g, true);
      }
      const top = y - PAD;
      let x = M;
      // Child
      let cy = top - 11;
      for (const l of childLines) (t(page, l, x + PAD, cy, 11.5, serif), (cy -= 14));
      cy += 2;
      for (const l of subLines) (t(page, l, x + PAD, cy, 8.5, sans, SOFT), (cy -= 11));
      for (const l of noteLines) (t(page, l, x + PAD, cy, 8, sans, BLUE), (cy -= 10));
      x += COLS[0].w;
      // Parents and their phones, side by side
      let py = top - 10;
      for (const b of parentBlocks) {
        b.name.forEach((l, i) => t(page, l, x + PAD, py - i * LH, 9.5, sans));
        b.phone.forEach((l, i) => t(page, l, x + COLS[1].w + PAD, py - i * LH, 9.5, sans));
        py -= Math.max(b.name.length, b.phone.length) * LH + 3;
      }
      x += COLS[1].w + COLS[2].w;
      // Allergies: tinted and dark red when there are any, so they stand out across the room.
      if (r.allergies) {
        page.drawRectangle({ x: x + 2, y: y - h + 3, width: COLS[3].w - 4, height: h - 6, color: ALERT });
        page.drawRectangle({ x: x + 2, y: y - h + 3, width: 2.5, height: h - 6, color: OXBLOOD });
      }
      allergyLines.forEach((l, i) => t(page, l, x + PAD + (r.allergies ? 3 : 0), top - 10 - i * LH, 9.5, sans, r.allergies ? OXBLOOD : SOFT));
      x += COLS[3].w;
      medLines.forEach((l, i) => t(page, l, x + PAD, top - 10 - i * LH, 9.5, sans, r.medications ? INK : SOFT));
      y -= h;
      page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: LINE });
    }
    y -= 14;
  }

  pages.forEach((p, i) => {
    const left = `Printed ${printed} by ${opts.printedBy}. Confidential: children’s health and family contact details. Keep with the team and shred after use.`;
    p.drawText(cleanFor(left, sans), { x: M, y: M - 6, size: 7.5, font: sans, color: SOFT });
    const right = `Page ${i + 1} of ${pages.length}`;
    p.drawText(right, { x: W - M - sans.widthOfTextAtSize(right, 7.5), y: M - 6, size: 7.5, font: sans, color: SOFT });
  });

  const slug = (program ?? "day").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return { bytes: await pdf.save(), filename: `yalla-${slug}-roster-${date}.pdf`, children: total };
}

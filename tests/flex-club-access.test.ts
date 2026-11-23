import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createTemplate } from "@/lib/ops/forms";
import * as s from "@/lib/db/schema";
import { asFamilyViewer, canOpenDocument, canOpenFamily, canOpenSubmission, flexClubFamilies, flexClubOnly } from "@/lib/auth/flex-club";
import { ALL_PERMISSIONS, DEFAULT_ROLES } from "@/lib/auth/permissions";
import type { StaffContext } from "@/lib/auth/staff";
import { can } from "@/lib/auth/staff";
import { confirmAdminBooking, createHold } from "@/lib/ops/bookings";
import { addDaysISO, todayLA } from "@/lib/time";
import { db, family, owner, program, reset, session } from "./helpers";

beforeEach(reset);

const role = DEFAULT_ROLES.find((r) => r.key === "club_ops_director")!;
const ops: StaffContext = { id: "ops", email: "ops@example.com", name: "Ops", roleKey: role.key, roleName: role.name, permissions: role.permissions, mfaEnabled: true, sessionId: "x", mfaVerified: true };
const ownerStaff: StaffContext = { ...ops, roleKey: "owner", permissions: ALL_PERMISSIONS };

async function book(familyId: string, childId: string, sessionId: string) {
  const h = await createHold(db(), owner, { familyId, items: [{ sessionId, childId }], source: "admin" });
  await confirmAdminBooking(db(), owner, h.booking.id, { createInvoice: false, notify: false });
}

async function setup() {
  const flex = await program({ slug: "yalla-flex", name: "Yalla Flex" });
  const camp = await program({ slug: "camp-yalla", name: "Camp Yalla", kind: "camp" });
  const club = await program({ slug: "club-yalla", name: "Club Yalla", kind: "membership" });
  const flexDay = await session(flex.id, { capacity: 5 });
  const campDay = await session(camp.id, { capacity: 5 });
  const flexFam = await family("Flex");
  const campFam = await family("Camp");
  const clubFam = await family("Club");
  const oldFlexFam = await family("Old");
  await book(flexFam.family.id, flexFam.children[0].id, flexDay.id);
  await book(campFam.family.id, campFam.children[0].id, campDay.id);
  // A Flex day long ago doesn't count.
  const old = await session(flex.id, { capacity: 5 }, -200);
  await db().insert(s.bookings).values({ id: "old-b", reference: "YL-OLD", familyId: oldFlexFam.family.id, status: "confirmed", source: "admin" });
  await db().insert(s.bookingItems).values({ bookingId: "old-b", sessionId: old.id, childId: oldFlexFam.children[0].id, status: "confirmed" });
  const [co] = await db().insert(s.cohorts).values({ name: "Sprouts" }).returning();
  await db()
    .insert(s.memberships)
    .values({ familyId: clubFam.family.id, childId: clubFam.children[0].id, programId: club.id, cohortId: co.id, weekdays: [1, 3], startsOn: addDaysISO(todayLA(), -30), status: "active", priceCents: 100000 });
  return { flexFam, campFam, clubFam, oldFlexFam };
}

describe("Flex & Club Yalla operations access", () => {
  it("the role sees no bookings, billing, messages or other families", () => {
    expect(flexClubOnly(ops)).toBe(true);
    for (const p of ["bookings.view", "billing.view", "communications.view", "families.view", "roster.view", "forms.view", "reports.view", "dashboard.view"] as const) expect(can(ops, p)).toBe(false);
    // On a Flex or Club Yalla family's page they get read-only contact, care and forms, still nothing else.
    const viewer = asFamilyViewer(ops);
    for (const p of ["families.view", "children.care", "forms.view", "forms.documents"] as const) expect(can(viewer, p)).toBe(true);
    for (const p of ["families.manage", "bookings.view", "billing.view", "communications.view", "memberships.view", "audit.view"] as const) expect(can(viewer, p)).toBe(false);
    expect(flexClubOnly(ownerStaff)).toBe(false);
    expect(asFamilyViewer(ownerStaff)).toBe(ownerStaff);
  });

  it("opens Flex and Club Yalla families only", async () => {
    const { flexFam, campFam, clubFam, oldFlexFam } = await setup();
    const scope = await flexClubFamilies(db());
    expect(scope.get(flexFam.family.id)).toEqual({ flex: true, club: false });
    expect(scope.get(clubFam.family.id)).toEqual({ flex: false, club: true });
    expect(scope.has(campFam.family.id)).toBe(false);
    expect(scope.has(oldFlexFam.family.id)).toBe(false);

    expect(await canOpenFamily(db(), ops, flexFam.family.id)).toBe(true);
    expect(await canOpenFamily(db(), ops, clubFam.family.id)).toBe(true);
    expect(await canOpenFamily(db(), ops, campFam.family.id)).toBe(false);
    expect(await canOpenFamily(db(), ownerStaff, campFam.family.id)).toBe(true);
  });

  it("opens forms and documents for those families only", async () => {
    const { flexFam, campFam } = await setup();
    const { template: tpl } = await createTemplate(db(), owner, { title: "Waiver", kind: "waiver", perChild: false, requiresSignature: true, frequency: "once", enforcement: "before_attendance", body: "Placeholder" });
    const [ver] = await db().select().from(s.formVersions).where(eq(s.formVersions.templateId, tpl.id));
    const docFor = async (familyId: string, name: string) => {
      const [doc] = await db().insert(s.documents).values({ familyId, filename: `${name}.pdf`, mimeType: "application/pdf", size: 3, data: Buffer.from("pdf") } as typeof s.documents.$inferInsert).returning();
      const [sub] = await db()
        .insert(s.formSubmissions)
        .values({ templateId: tpl.id, versionId: ver.id, familyId, status: "signed", documentId: doc.id, versionBody: "Placeholder", contentHash: "x" } as typeof s.formSubmissions.$inferInsert)
        .returning();
      return { doc, sub };
    };
    const mine = await docFor(flexFam.family.id, "flex");
    const theirs = await docFor(campFam.family.id, "camp");
    expect(await canOpenSubmission(db(), ops, mine.sub.id)).toBe(true);
    expect(await canOpenSubmission(db(), ops, theirs.sub.id)).toBe(false);
    expect(await canOpenDocument(db(), ops, mine.doc.id)).toBe(true);
    expect(await canOpenDocument(db(), ops, theirs.doc.id)).toBe(false);
    // An uploaded document with no form behind it follows its family too.
    const [upload] = await db().insert(s.documents).values({ familyId: campFam.family.id, filename: "x.pdf", mimeType: "application/pdf", size: 1, data: Buffer.from("x") }).returning();
    expect(await canOpenDocument(db(), ops, upload.id)).toBe(false);
  });
});

describe("supplies and maintenance lists", () => {
  it("adds, moves along, closes, reopens and removes items", async () => {
    const { addOpsRequest, opsList, opsOpenCounts, removeOpsRequest, setOpsStatus } = await import("@/lib/ops/ops-requests");
    const me = { type: "staff" as const, id: "ops", name: "Olivia" };
    await expect(addOpsRequest(db(), me, { kind: "supply", title: "  " })).rejects.toThrow();
    const wipes = await addOpsRequest(db(), me, { kind: "supply", title: "Wipes", quantity: "3 packs", location: "Sprouts" });
    await addOpsRequest(db(), me, { kind: "supply", title: "Paper towels", urgency: "urgent" });
    const sink = await addOpsRequest(db(), me, { kind: "maintenance", title: "Sink drips", location: "Saplings room", urgency: "bogus" });
    expect(wipes.status).toBe("needed");
    expect(sink.status).toBe("reported");
    expect(sink.urgency).toBe("normal");

    let supplies = await opsList(db(), "supply");
    expect(supplies.open.map((r) => r.title)).toEqual(["Paper towels", "Wipes"]); // urgent first
    expect(await opsOpenCounts(db())).toEqual({ supply: { n: 2, urgent: 1 }, maintenance: { n: 1, urgent: 0 } });

    await setOpsStatus(db(), me, wipes.id, "ordered");
    await setOpsStatus(db(), me, wipes.id, "received");
    supplies = await opsList(db(), "supply");
    expect(supplies.open.map((r) => r.title)).toEqual(["Paper towels"]);
    expect(supplies.closed[0]).toMatchObject({ title: "Wipes", closedByName: "Olivia" });
    await expect(setOpsStatus(db(), me, wipes.id, "fixed")).rejects.toThrow(); // not a supply step

    await setOpsStatus(db(), me, wipes.id, "needed"); // reopen
    expect((await opsList(db(), "supply")).open).toHaveLength(2);
    await removeOpsRequest(db(), me, sink.id);
    expect((await opsList(db(), "maintenance")).open).toHaveLength(0);
    expect(can(ops, "ops.lists")).toBe(true);
  });
});

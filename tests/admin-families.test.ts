import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as s from "@/lib/db/schema";
import { OpsError } from "@/lib/audit";
import { DEFAULT_ROLES, type Permission } from "@/lib/auth/permissions";
import type { StaffContext } from "@/lib/auth/staff";
import { addChild, createFamily, updateFamily } from "@/lib/ops/families";
import { addRequirement, createTemplate, deactivateRequirement, paperworkStatus, storeDocument } from "@/lib/ops/forms";
import { familyDirectory, familyProfile, openDocument } from "@/lib/admin/queries/families";
import { db, family, owner, reset } from "./helpers";

beforeEach(reset);

const asRole = (key: string): StaffContext => ({
  id: `staff-${key}`,
  email: `${key}@example.com`,
  name: key,
  roleKey: key,
  roleName: key,
  permissions: DEFAULT_ROLES.find((r) => r.key === key)!.permissions as Permission[],
  mfaEnabled: false,
  sessionId: "s",
  mfaVerified: true,
});

describe("families", () => {
  it("won't duplicate a family when a returning guardian's email is used again", async () => {
    const first = await createFamily(db(), owner, { guardian: { firstName: "Robin", lastName: "Example", email: "robin@example.com" } });
    try {
      await createFamily(db(), owner, { guardian: { firstName: "Robin", lastName: "Example", email: "ROBIN@example.com " } });
      throw new Error("expected duplicate");
    } catch (e) {
      expect(e).toBeInstanceOf(OpsError);
      expect((e as OpsError).code).toBe("duplicate");
      expect((e as OpsError).details).toEqual({ familyId: first.family.id });
    }
    const a = await addChild(db(), owner, first.family.id, { firstName: "Ivy", lastName: "Example", birthDate: "2023-04-01" });
    const b = await addChild(db(), owner, first.family.id, { firstName: "ivy", lastName: "Example", birthDate: "2023-04-01" });
    expect(a.existed).toBe(false);
    expect(b.existed).toBe(true);
    expect(b.child.id).toBe(a.child.id);
  });

  it("strips care details and money from loaders for roles without access", async () => {
    const f = await family("Care", [{ first: "Ada", birth: "2023-01-01" }]);
    await db().update(s.children).set({ allergies: "Peanuts", staffNotes: "Private" }).where(eq(s.children.id, f.children[0].id));
    const educator = await familyProfile(db(), asRole("educator"), f.family.id);
    const billing = await familyProfile(db(), asRole("billing"), f.family.id);
    const ops = await familyProfile(db(), asRole("operations"), f.family.id);
    expect(educator!.children[0].allergies).toBe("Peanuts");
    expect(educator!.children[0].staffNotes).toBeNull();
    expect(educator!.ledger).toBeNull();
    expect(billing!.children[0].allergies).toBeNull();
    expect(billing!.pickups).toBeNull();
    expect(billing!.ledger).not.toBeNull();
    expect(ops!.children[0].staffNotes).toBe("Private");
    const dir = await familyDirectory(db(), asRole("educator"), "");
    expect(dir[0].balance).toBeNull();
  });

  it("records preference changes in the audit trail", async () => {
    const f = await family("Prefs");
    await updateFamily(db(), owner, f.family.id, { marketingOptIn: true, communicationPrefs: { email: true, sms: true } });
    const log = await db().select().from(s.auditLog).where(eq(s.auditLog.entityId, f.family.id));
    expect(log.some((l) => l.action === "family.update")).toBe(true);
  });
});

describe("documents and requirements", () => {
  it("only lets staff with document permission download, and audits each download", async () => {
    const f = await family("Docs");
    const id = await storeDocument(db(), owner, { familyId: f.family.id, filename: "record.pdf", mimeType: "application/pdf", data: Buffer.from("%PDF-1.4 test") });
    expect((await openDocument(db(), null, id)).status).toBe(401);
    expect((await openDocument(db(), asRole("educator"), id)).status).toBe(403);
    expect((await openDocument(db(), asRole("billing"), id)).status).toBe(403);
    const ok = await openDocument(db(), asRole("operations"), id);
    expect(ok.status).toBe(200);
    if (ok.status === 200) expect(ok.doc.data.toString()).toContain("%PDF");
    const log = await db().select().from(s.auditLog).where(eq(s.auditLog.action, "documents.download"));
    expect(log).toHaveLength(1);
  });

  it("stops requiring a form once its requirement is removed, keeping history", async () => {
    const f = await family("Req");
    const { template } = await createTemplate(db(), owner, { title: "Photo preferences", kind: "form", perChild: true, requiresSignature: false, frequency: "once", enforcement: "before_attendance", body: "Text" });
    const r = await addRequirement(db(), owner, { templateId: template.id, scope: "all" });
    const before = (await paperworkStatus(db(), { familyId: f.family.id, childIds: [f.children[0].id] })).get(f.children[0].id)!;
    expect(before).toHaveLength(1);
    await deactivateRequirement(db(), owner, r.id);
    const after = (await paperworkStatus(db(), { familyId: f.family.id, childIds: [f.children[0].id] })).get(f.children[0].id)!;
    expect(after).toHaveLength(0);
    const [row] = await db().select().from(s.formRequirements).where(eq(s.formRequirements.id, r.id));
    expect(row.active).toBe(false);
  });
});

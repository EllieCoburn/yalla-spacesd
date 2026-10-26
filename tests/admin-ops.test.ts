import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as s from "@/lib/db/schema";
import { createStaff } from "@/lib/auth/staff";
import { createHold, confirmAdminBooking, cancelBooking } from "@/lib/ops/bookings";
import { createInvoice, invoiceDueCharges, recordOfflinePayment, refundPayment, saveDiscount } from "@/lib/ops/billing";
import { reportById, toCsv } from "@/lib/ops/reports";
import { changeRole, createRole, inviteStaff, setStaffStatus, updateRolePermissions } from "@/lib/ops/staff-admin";
import { savePool, setOperatingHours, getOperatingHours, DEFAULT_HOURS } from "@/lib/ops/settings";
import { addDaysISO, todayLA } from "@/lib/time";
import { db, family, owner, program, reset, session } from "./helpers";

beforeEach(reset);

describe("scheduled charges", () => {
  it("invoices due charges once, even when run twice at the same time", async () => {
    const f = await family("Member");
    const today = todayLA();
    await db().insert(s.scheduledCharges).values([
      { familyId: f.family.id, description: "Club Yalla — due", amountCents: 72000, scheduledFor: addDaysISO(today, -1) },
      { familyId: f.family.id, description: "Club Yalla — later", amountCents: 72000, scheduledFor: addDaysISO(today, 20) },
    ]);
    const [a, b] = await Promise.all([invoiceDueCharges(db(), owner, today), invoiceDueCharges(db(), owner, today)]);
    expect(a.created + b.created).toBe(1);
    await invoiceDueCharges(db(), owner, today);
    const invs = await db().select().from(s.invoices).where(eq(s.invoices.familyId, f.family.id));
    expect(invs).toHaveLength(1);
    const charges = await db().select().from(s.scheduledCharges);
    expect(charges.filter((c) => c.status === "invoiced")).toHaveLength(1);
    expect(charges.filter((c) => c.status === "scheduled")).toHaveLength(1);
  });
});

describe("reports", () => {
  it("separates value of care booked from payments collected", async () => {
    const p = await program({ priceCents: 15000 });
    const sess = await session(p.id, { capacity: 5 }, 3);
    const a = await family("Rep");
    const hold = await createHold(db(), owner, { familyId: a.family.id, items: [{ sessionId: sess.id, childId: a.children[0].id }], source: "admin" });
    await confirmAdminBooking(db(), owner, hold.booking.id, { createInvoice: true, notify: false });
    const range = { from: todayLA(), to: addDaysISO(todayLA(), 10) };
    const bookings = await reportById("bookings")!.run(db(), range);
    expect(bookings.totals!.confirmed).toBe(1);
    expect(bookings.totals!.value).toBe(15000);
    let paymentsR = await reportById("payments")!.run(db(), range);
    expect(paymentsR.totals!.amount).toBe(0);
    const [inv] = await db().select().from(s.invoices).where(eq(s.invoices.bookingId, hold.booking.id));
    await recordOfflinePayment(db(), owner, { invoiceId: inv.id, amountCents: 10000, method: "offline_cash", note: "Cash", idempotencyKey: "k1" });
    paymentsR = await reportById("payments")!.run(db(), range);
    expect(paymentsR.totals!.amount).toBe(10000);
    const outstanding = await reportById("outstanding")!.run(db(), range);
    expect(outstanding.totals!.balance).toBe(5000);
    const occ = await reportById("occupancy")!.run(db(), range);
    expect(occ.rows.find((r) => r.id === sess.id)!.remaining).toBe(4);
  });

  it("counts cancellations and refunds without implying one causes the other", async () => {
    const p = await program();
    const sess = await session(p.id, { capacity: 5 }, 2);
    const a = await family("Can");
    const hold = await createHold(db(), owner, { familyId: a.family.id, items: [{ sessionId: sess.id, childId: a.children[0].id }], source: "admin" });
    await confirmAdminBooking(db(), owner, hold.booking.id, { createInvoice: false, notify: false });
    await cancelBooking(db(), owner, { bookingId: hold.booking.id, reason: "Sick", notify: false });
    const range = { from: todayLA(), to: addDaysISO(todayLA(), 5) };
    expect((await reportById("cancellations")!.run(db(), range)).totals!.cancelled).toBe(1);
    expect((await reportById("refunds")!.run(db(), range)).rows).toHaveLength(0);
    const inv = await createInvoice(db(), owner, { familyId: a.family.id, description: "X", lines: [{ kind: "charge", description: "X", unitCents: 5000 }] });
    const pay = await recordOfflinePayment(db(), owner, { invoiceId: inv.id, amountCents: 5000, method: "offline_check", note: "1", idempotencyKey: "p" });
    await refundPayment(db(), owner, { paymentId: pay!.id, amountCents: 2000, reason: "Partial", reduceAmountOwed: true, idempotencyKey: "r" });
    expect((await reportById("refunds")!.run(db(), range)).totals!.amount).toBe(2000);
  });

  it("neutralizes spreadsheet formulas in CSV", () => {
    const csv = toCsv({ columns: [{ key: "a", label: "Name" }, { key: "m", label: "Amount", kind: "money" }], rows: [{ a: "=HYPERLINK(\"x\")", m: 12345 }] });
    expect(csv.split("\n")[1]).toBe(`"'=HYPERLINK(""x"")",123.45`);
  });
});

describe("staff administration", () => {
  it("protects the last owner and your own account", async () => {
    const o = await createStaff(db(), owner, { email: "o@example.com", name: "Only Owner", roleKey: "owner", password: "owner-password-123" });
    const me = { type: "staff" as const, id: o.id, name: o.name };
    await expect(setStaffStatus(db(), me, o.id, "disabled")).rejects.toThrow(/your own/);
    await expect(changeRole(db(), me, o.id, "operations")).rejects.toThrow(/at least one active owner/);
    const o2 = await createStaff(db(), owner, { email: "o2@example.com", name: "Second Owner", roleKey: "owner", password: "owner-password-456" });
    await changeRole(db(), me, o2.id, "operations");
    await expect(setStaffStatus(db(), { type: "staff", id: "someone", name: "x" }, o.id, "disabled")).rejects.toThrow(/last active owner/);
  });

  it("never edits the owner role, and audits permission changes", async () => {
    const [ownerRole] = await db().select().from(s.roles).where(eq(s.roles.key, "owner"));
    await expect(updateRolePermissions(db(), owner, ownerRole.id, ["dashboard.view"])).rejects.toThrow(/owner role/);
    const [edu] = await db().select().from(s.roles).where(eq(s.roles.key, "educator"));
    await updateRolePermissions(db(), owner, edu.id, ["roster.view", "not.a.permission", "children.care"]);
    const [after] = await db().select().from(s.roles).where(eq(s.roles.id, edu.id));
    expect(after.permissions).toEqual(["roster.view", "children.care"]);
    const logs = await db().select().from(s.auditLog).where(eq(s.auditLog.action, "staff.role_permissions"));
    expect(logs[0].summary).toMatch(/removed/);
    const r = await createRole(db(), owner, { name: "Front desk", copyFrom: edu.id });
    expect(r.permissions).toEqual(["roster.view", "children.care"]);
  });

  it("invites staff with a captured email and a single-use link", async () => {
    const res = await inviteStaff(db(), owner, { email: "new@example.com", name: "New Person", roleKey: "educator" }, "http://localhost");
    expect(res.mode).toBe("test");
    expect(res.link).toMatch(/\/admin\/reset\?token=.+&invite=1/);
    const msgs = await db().select().from(s.messages).where(eq(s.messages.toAddress, "new@example.com"));
    expect(msgs[0].status).toBe("captured");
    await expect(inviteStaff(db(), owner, { email: "new@example.com", name: "Again", roleKey: "educator" }, "http://localhost")).rejects.toThrow(/already exists/);
  });
});

describe("settings", () => {
  it("validates pools, hours and discounts", async () => {
    await expect(savePool(db(), owner, { name: "Room", capacity: 0 })).rejects.toThrow(/at least 1/);
    await savePool(db(), owner, { name: "Room", capacity: 6 });
    expect((await getOperatingHours(db())).saved).toBe(false);
    const bad = DEFAULT_HOURS.map((h) => (h.day === 1 ? { ...h, close: "07:00" } : h));
    await expect(setOperatingHours(db(), owner, bad)).rejects.toThrow(/after opening/);
    await setOperatingHours(db(), owner, DEFAULT_HOURS);
    expect((await getOperatingHours(db())).saved).toBe(true);
    await saveDiscount(db(), owner, { name: "Spring", code: "spring-10", kind: "percent", value: 10, active: true });
    await expect(saveDiscount(db(), owner, { name: "Dup", code: "SPRING-10", kind: "fixed", value: 500, active: true })).rejects.toThrow(/already in use/);
    await expect(saveDiscount(db(), owner, { name: "Big", kind: "percent", value: 150, active: true })).rejects.toThrow(/between/);
  });
});

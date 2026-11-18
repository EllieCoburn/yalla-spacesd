/**
 * Invoice PDFs families download from the Family Portal: US Letter (8.5 × 11 in), in Yalla's
 * brand (logo, Lora and DM Sans, periwinkle and ink), with Yalla's name, address and EIN in the
 * top left, who was billed, every line with its price, discounts, totals, payments and refunds.
 * Complete enough to file for taxes or a dependent care account.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { and, asc, eq } from "drizzle-orm";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { Executor } from "@/lib/db";
import { bookings, families, guardians, invoiceLines, invoices, payments, playPassCharges, playPassPlans, refunds } from "@/lib/db/schema";
import { checkoutLabel } from "@/lib/ops/bookings";
import { invoiceTotals } from "@/lib/ops/billing";
import { fmtDate } from "@/lib/time";
import { invoiceIssuer } from "@/content/site";

const W = 612; // 8.5in
const H = 792; // 11in
const M = 54; // 0.75in margins
const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
// Yalla's palette (app/globals.css).
const INK = hex("#292c45");
const SOFT = hex("#5a5d74");
const BLUE = hex("#6065f2");
const SAND = hex("#ebe6dc");
const MIST = hex("#e7e5f1");
const LINE = hex("#d6cfc3");
const OXBLOOD = hex("#673e46");

const usd = (c: number) => (c < 0 ? "-" : "") + "$" + (Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (d: Date) => d.toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "long", day: "numeric" });

/** Fonts and the logo, read once per server instance. */
let assets: Promise<{ lora: Buffer; loraItalic: Buffer; sans: Buffer; logo: Buffer }> | null = null;
function loadAssets() {
  const dir = path.join(process.cwd(), "lib/billing/assets");
  assets ??= Promise.all(["Lora-Variable.ttf", "Lora-Italic-Variable.ttf", "DMSans-Variable.ttf", "yalla-logo.png"].map((f) => readFile(path.join(dir, f)))).then(([lora, loraItalic, sans, logo]) => ({ lora, loraItalic, sans, logo }));
  return assets;
}

/** Any character a font can't draw becomes a plain stand-in rather than breaking the PDF. */
function clean(s: string, font: PDFFont) {
  const swapped = s.replace(/ /g, " ");
  let out = "";
  for (const ch of swapped) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += ch === "−" ? "-" : "?";
    }
  }
  return out;
}

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (font.widthOfTextAtSize(next, size) <= width) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

/** Everything an invoice PDF shows, from a booking invoice or a Play Pass payment alike. */
type InvoiceDoc = {
  inv: { number: string; status: string; issuedAt: Date; dueOn: string | null; periodStart: string | null; periodEnd: string | null; familyId: string };
  lines: { kind: string; description: string; quantity: number; unitCents: number; amountCents: number }[];
  pays: { succeededAt: Date | null; createdAt: Date; method: string; amountCents: number }[];
  refs: { createdAt: Date; amountCents: number }[];
  t: { charges: number; discounts: number; tax: number; adjustments: number; total: number; walletApplied: number; creditApplied: number; paid: number; refunded: number; balance: number };
  service: string;
  ref: string | null;
  refLabel?: string;
};

async function invoiceDoc(db: Executor, invoiceId: string): Promise<InvoiceDoc | null> {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv) return null;
  const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId)).orderBy(asc(invoiceLines.createdAt));
  const pays = (await db.select().from(payments).where(eq(payments.invoiceId, invoiceId)).orderBy(asc(payments.createdAt))).filter((p) => p.status === "succeeded");
  const refs = (await db.select().from(refunds).where(eq(refunds.invoiceId, invoiceId)).orderBy(asc(refunds.createdAt))).filter((r) => r.status === "succeeded");
  const t = (await invoiceTotals(db, [invoiceId])).get(invoiceId)!;
  // What was bought, in words families recognize, with the booking reference for their records.
  const service = inv.bookingId ? (await checkoutLabel(db, inv.bookingId)).name : (inv.description ?? "Childcare services");
  const ref = inv.bookingId ? ((await db.select({ reference: bookings.reference }).from(bookings).where(eq(bookings.id, inv.bookingId)))[0]?.reference ?? null) : null;
  return { inv, lines, pays, refs, t, service, ref };
}

/** Play Pass membership payments are charged by Stripe each month: each paid one gets an invoice too. */
async function playPassDoc(db: Executor, chargeId: string): Promise<InvoiceDoc | null> {
  const [c] = await db.select().from(playPassCharges).where(eq(playPassCharges.id, chargeId));
  if (!c || !["paid", "refunded", "disputed"].includes(c.status)) return null;
  const [plan] = c.planId ? await db.select().from(playPassPlans).where(eq(playPassPlans.id, c.planId)) : [];
  const what = { initial: "first month", renewal: "monthly renewal", upgrade: "upgrade", resume: "return from pause" }[c.reason] ?? "membership payment";
  const service = `${plan?.name ?? "Play Pass"} membership · ${what}`;
  const period = c.periodStart ? ` · from ${fmtDate(c.periodStart, "MMM d, yyyy")}` : "";
  const refunded = c.refundedCents;
  return {
    inv: { number: `PP-${c.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`, status: "paid", issuedAt: c.createdAt, dueOn: null, periodStart: null, periodEnd: null, familyId: c.familyId },
    lines: [{ kind: "charge", description: `${service}${period}`, quantity: 1, unitCents: c.amountCents, amountCents: c.amountCents }],
    pays: [{ succeededAt: c.createdAt, createdAt: c.createdAt, method: "card", amountCents: c.amountCents }],
    refs: refunded ? [{ createdAt: c.updatedAt, amountCents: refunded }] : [],
    t: { charges: c.amountCents, discounts: 0, tax: 0, adjustments: 0, total: c.amountCents, walletApplied: 0, creditApplied: 0, paid: c.amountCents, refunded, balance: 0 },
    service,
    ref: null,
  };
}

export async function invoicePdf(db: Executor, invoiceId: string) {
  const doc = await invoiceDoc(db, invoiceId);
  return doc ? renderInvoice(db, doc) : null;
}

export async function playPassChargePdf(db: Executor, chargeId: string) {
  const doc = await playPassDoc(db, chargeId);
  return doc ? renderInvoice(db, doc) : null;
}

async function renderInvoice(db: Executor, { inv, lines, pays, refs, t, service, ref, refLabel = "Booking reference" }: InvoiceDoc) {
  const [fam] = await db.select().from(families).where(eq(families.id, inv.familyId));
  const [primary] = await db.select().from(guardians).where(and(eq(guardians.familyId, inv.familyId), eq(guardians.isPrimary, true)));

  const a = await loadAssets();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`Invoice ${inv.number} · ${invoiceIssuer.name}`);
  pdf.setAuthor(invoiceIssuer.name);
  pdf.setSubject(`Invoice ${inv.number}`);
  pdf.setCreator(invoiceIssuer.name);
  const serif = await pdf.embedFont(a.lora, { subset: true });
  const serifItalic = await pdf.embedFont(a.loraItalic, { subset: true });
  const sans = await pdf.embedFont(a.sans, { subset: true });
  const logo: PDFImage = await pdf.embedPng(a.logo);

  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;
  type Opt = { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; align?: "left" | "right"; spacing?: number };
  const text = (s: string, x: number, yy: number, o: Opt = {}) => {
    const font = o.font ?? sans;
    const size = o.size ?? 10;
    const str = clean(s, font);
    const color = o.color ?? INK;
    if (o.spacing) {
      // Letter-spaced labels ("BILL TO"), the way the site sets its eyebrows: drawn a letter at a time.
      const chars = [...str];
      const width = chars.reduce((w, c) => w + font.widthOfTextAtSize(c, size), 0) + o.spacing * (chars.length - 1);
      let cx = o.align === "right" ? x - width : x;
      for (const c of chars) {
        page.drawText(c, { x: cx, y: yy, size, font, color });
        cx += font.widthOfTextAtSize(c, size) + o.spacing;
      }
      return;
    }
    const dx = o.align === "right" ? x - font.widthOfTextAtSize(str, size) : x;
    page.drawText(str, { x: dx, y: yy, size, font, color });
  };
  const eyebrow = (s: string, x: number, yy: number, align: "left" | "right" = "left") => text(s.toUpperCase(), x, yy, { size: 7.5, color: BLUE, spacing: 1, align });
  const rule = (yy: number, color = LINE, thickness = 0.75, x1 = M, x2 = W - M) => page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness, color });

  // A periwinkle band across the top edge, like the site's announcement bar.
  page.drawRectangle({ x: 0, y: H - 10, width: W, height: 10, color: BLUE });

  // ── Header: the issuer, top left, exactly as Yalla supplied it; the logo top right.
  text(`Invoice #${inv.number}`, M, y - 14, { size: 11, color: SOFT });
  text(invoiceIssuer.name, M, y - 40, { size: 24, font: serif });
  invoiceIssuer.lines.forEach((l, i) => text(l, M, y - 60 - i * 15, { size: 10.5, color: SOFT }));
  const logoH = 82;
  const logoW = (logo.width / logo.height) * logoH;
  page.drawImage(logo, { x: W - M - logoW, y: y - logoH + 4, width: logoW, height: logoH });
  y -= Math.max(60 + (invoiceIssuer.lines.length - 1) * 15 + 10, logoH) + 22;

  // ── The invoice at a glance: status, dates and amount, in a soft mist panel.
  const status = inv.status === "void" ? "Void" : t.balance <= 0 && t.total > 0 ? "Paid in full" : t.total === 0 ? "No charge" : "Amount due";
  const facts: [string, string][] = [
    ["Date issued", day(inv.issuedAt)],
    ...(inv.dueOn ? ([["Due", fmtDate(inv.dueOn, "MMMM d, yyyy")]] as [string, string][]) : []),
    ...(pays.length ? ([["Date paid", day(pays[pays.length - 1].succeededAt ?? pays[pays.length - 1].createdAt)]] as [string, string][]) : []),
    ...(inv.periodStart && inv.periodEnd ? ([["Service period", `${fmtDate(inv.periodStart, "MMM d")} – ${fmtDate(inv.periodEnd, "MMM d, yyyy")}`]] as [string, string][]) : []),
  ];
  const panelH = 64;
  page.drawRectangle({ x: M, y: y - panelH, width: W - 2 * M, height: panelH, color: MIST });
  const colW = (W - 2 * M - 40) / (facts.length + 1);
  facts.forEach(([k, v], i) => {
    eyebrow(k, M + 20 + i * colW, y - 24);
    text(v, M + 20 + i * colW, y - 42, { size: 11 });
  });
  eyebrow(status, W - M - 20, y - 24, "right");
  text(usd(inv.status === "void" ? 0 : t.balance > 0 ? t.balance : t.total), W - M - 20, y - 46, { size: 20, font: serif, align: "right", color: status === "Amount due" ? OXBLOOD : INK });
  y -= panelH + 28;

  // ── Bill to, and what it was for.
  const half = M + (W - 2 * M) / 2 + 10;
  eyebrow("Bill to", M, y);
  eyebrow("For", half, y);
  y -= 17;
  const billTo = [primary ? `${primary.firstName} ${primary.lastName}` : (fam?.name ?? ""), fam?.name && primary ? fam.name : "", primary?.email ?? "", primary?.phone ?? ""].filter(Boolean);
  billTo.forEach((l, i) => text(l, M, y - i * 14, i === 0 ? { size: 12, font: serif } : { size: 10, color: SOFT }));
  const forLines = wrap(clean(service, serif), serif, 12, W - M - half);
  forLines.forEach((l, i) => text(l, half, y - i * 15, { size: 12, font: serif }));
  if (ref) text(`${refLabel} ${ref}`, half, y - forLines.length * 15, { size: 10, color: SOFT });
  y -= Math.max(billTo.length * 14, forLines.length * 15 + (ref ? 14 : 0)) + 22;

  // ── Line items.
  const colQty = W - M - 170;
  const colUnit = W - M - 92;
  const colAmt = W - M - 12;
  const descW = colQty - 40 - M;
  const tableHeader = () => {
    page.drawRectangle({ x: M, y: y - 8, width: W - 2 * M, height: 24, color: SAND });
    text("DESCRIPTION", M + 12, y, { size: 7.5, color: INK, spacing: 1 });
    text("QTY", colQty, y, { size: 7.5, color: INK, spacing: 1, align: "right" });
    text("UNIT PRICE", colUnit, y, { size: 7.5, color: INK, spacing: 1, align: "right" });
    text("AMOUNT", colAmt, y, { size: 7.5, color: INK, spacing: 1, align: "right" });
    y -= 30;
  };
  const newPage = () => {
    page = pdf.addPage([W, H]);
    page.drawRectangle({ x: 0, y: H - 10, width: W, height: 10, color: BLUE });
    y = H - M;
    text(`${invoiceIssuer.name} · Invoice #${inv.number}`, M, y - 10, { size: 9, color: SOFT });
    text("continued", W - M, y - 10, { size: 9, font: serifItalic, color: BLUE, align: "right" });
    y -= 36;
  };
  const ensure = (needed: number) => {
    if (y - needed < M + 50) {
      newPage();
      return true;
    }
    return false;
  };
  tableHeader();
  const kindLabel: Record<string, string> = { discount: "Discount", fee: "Fee", tax: "Tax", adjustment: "Adjustment" };
  for (const l of lines) {
    const desc = wrap(clean(l.description, sans), sans, 10, descW);
    const h = desc.length * 13 + (kindLabel[l.kind] ? 11 : 0) + 14;
    if (ensure(h)) tableHeader();
    const color = l.kind === "discount" ? BLUE : INK;
    desc.forEach((d, i) => text(d, M + 12, y - i * 13, { size: 10, color }));
    if (kindLabel[l.kind]) text(kindLabel[l.kind], M + 12, y - desc.length * 13, { size: 7.5, font: serifItalic, color: SOFT });
    text(String(l.quantity), colQty, y, { size: 10, align: "right", color });
    text(usd(l.unitCents), colUnit, y, { size: 10, align: "right", color });
    text(usd(l.amountCents), colAmt, y, { size: 10, align: "right", color });
    // The divider sits under the row's last line (or its small label), then the next row starts.
    const bottom = y - (desc.length - 1) * 13 - (kindLabel[l.kind] ? 11 : 0) - 9;
    rule(bottom, LINE, 0.5);
    y = bottom - 17;
  }

  // ── Totals, right aligned; the balance in a sand panel.
  const tx = W - M - 240;
  const totals: [string, number][] = [["Subtotal", t.charges]];
  if (t.discounts) totals.push(["Discounts", t.discounts]);
  if (t.tax) totals.push(["Tax", t.tax]);
  if (t.adjustments) totals.push(["Adjustments", t.adjustments]);
  const after: [string, number][] = [];
  if (t.walletApplied) after.push(["Paid from Play Pass", -t.walletApplied]);
  if (t.creditApplied - t.walletApplied > 0) after.push(["Paid from Yalla Wallet credit", -(t.creditApplied - t.walletApplied)]);
  if (t.paid) after.push(["Payments received", -t.paid]);
  if (t.refunded) after.push(["Refunded", t.refunded]);
  ensure((totals.length + after.length) * 17 + 90);
  y -= 6;
  for (const [label, cents] of totals) {
    text(label, tx, y, { size: 10, color: label === "Discounts" ? BLUE : SOFT });
    text(usd(cents), colAmt, y, { size: 10, align: "right", color: label === "Discounts" ? BLUE : INK });
    y -= 17;
  }
  rule(y + 9, INK, 0.75, tx, W - M);
  y -= 8;
  text("Total", tx, y, { size: 13, font: serif });
  text(usd(t.total), colAmt, y, { size: 13, font: serif, align: "right" });
  y -= 22;
  for (const [label, cents] of after) {
    text(label, tx, y, { size: 10, color: SOFT });
    text(usd(cents), colAmt, y, { size: 10, align: "right" });
    y -= 17;
  }
  y -= 10;
  page.drawRectangle({ x: tx - 12, y: y - 11, width: W - M - tx + 12, height: 30, color: SAND });
  text(inv.status === "void" ? "Balance (void)" : "Balance due", tx, y, { size: 12, font: serif });
  text(usd(Math.max(t.balance, 0)), colAmt, y, { size: 13, font: serif, align: "right" });
  y -= 40;

  // ── Payments and refunds.
  if (pays.length || refs.length) {
    ensure(46 + (pays.length + refs.length) * 16);
    y -= 8;
    eyebrow("Payment history", M, y);
    y -= 8;
    rule(y);
    y -= 16;
    const method: Record<string, string> = { card: "Card", offline_cash: "Cash", offline_check: "Check", offline_other: "Other", credit: "Yalla Wallet credit" };
    for (const p of pays) {
      text(day(p.succeededAt ?? p.createdAt), M, y, { size: 10 });
      text(`Payment · ${method[p.method] ?? p.method}`, M + 150, y, { size: 10, color: SOFT });
      text(usd(p.amountCents), colAmt, y, { size: 10, align: "right" });
      y -= 16;
    }
    for (const r of refs) {
      text(day(r.createdAt), M, y, { size: 10 });
      text("Refund", M + 150, y, { size: 10, color: SOFT });
      text(usd(-r.amountCents), colAmt, y, { size: 10, align: "right" });
      y -= 16;
    }
  }

  // ── Footer on every page: a warm thank-you and how to reach Yalla.
  const pages = pdf.getPages();
  pages.forEach((pg, i) => {
    page = pg;
    rule(M + 30, BLUE, 1);
    text("Thank you for being part of Yalla.", M, M + 12, { size: 11, font: serifItalic, color: BLUE });
    text("Questions about this invoice? hello@yallaspacesd.com · 619.775.4008", M, M - 2, { size: 8, color: SOFT });
    text(`Page ${i + 1} of ${pages.length}`, W - M, M + 12, { size: 8, color: SOFT, align: "right" });
    text("yallaspacesd.com", W - M, M - 2, { size: 8, color: SOFT, align: "right" });
  });

  return { bytes: await pdf.save(), filename: `Yalla-invoice-${inv.number}.pdf`, familyId: inv.familyId };
}

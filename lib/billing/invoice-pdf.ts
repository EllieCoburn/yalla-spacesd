/**
 * Invoice PDFs families download from the Family Portal: US Letter (8.5 × 11 in), with Yalla's
 * name, address and EIN in the top left, who was billed, every line with its price, discounts,
 * totals, payments and refunds. Plain and complete, so it works as a record for taxes or a
 * dependent care account.
 */
import { and, asc, eq } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Executor } from "@/lib/db";
import { bookings, families, guardians, invoiceLines, invoices, payments, refunds } from "@/lib/db/schema";
import { checkoutLabel } from "@/lib/ops/bookings";
import { invoiceTotals } from "@/lib/ops/billing";
import { fmtDate } from "@/lib/time";
import { invoiceIssuer } from "@/content/site";

const W = 612; // 8.5in
const H = 792; // 11in
const M = 54; // 0.75in margins
const INK = rgb(0.16, 0.17, 0.27);
const SOFT = rgb(0.4, 0.41, 0.48);
const LINE = rgb(0.85, 0.84, 0.82);
const BLUE = rgb(0.376, 0.396, 0.949);

const usd = (c: number) => (c < 0 ? "-" : "") + "$" + (Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (d: Date) => d.toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "long", day: "numeric" });

/** The standard PDF fonts only cover Western characters: swap the typographic ones we use. */
function clean(s: string, font: PDFFont) {
  const swapped = s.replace(/[−‐‑]/g, "-").replace(/[“”]/g, '"').replace(/ /g, " ");
  let out = "";
  for (const ch of swapped) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
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

export async function invoicePdf(db: Executor, invoiceId: string) {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv) return null;
  const [fam] = await db.select().from(families).where(eq(families.id, inv.familyId));
  const [primary] = await db.select().from(guardians).where(and(eq(guardians.familyId, inv.familyId), eq(guardians.isPrimary, true)));
  const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId)).orderBy(asc(invoiceLines.createdAt));
  const pays = (await db.select().from(payments).where(eq(payments.invoiceId, invoiceId)).orderBy(asc(payments.createdAt))).filter((p) => p.status === "succeeded");
  const refs = (await db.select().from(refunds).where(eq(refunds.invoiceId, invoiceId)).orderBy(asc(refunds.createdAt))).filter((r) => r.status === "succeeded");
  const t = (await invoiceTotals(db, [invoiceId])).get(invoiceId)!;

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Invoice ${inv.number} · ${invoiceIssuer.name}`);
  pdf.setAuthor(invoiceIssuer.name);
  pdf.setSubject(`Invoice ${inv.number}`);
  pdf.setCreator(invoiceIssuer.name);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;
  const text = (s: string, x: number, yy: number, o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; align?: "left" | "right" } = {}) => {
    const font = o.font ?? reg;
    const size = o.size ?? 10;
    const str = clean(s, font);
    const dx = o.align === "right" ? x - font.widthOfTextAtSize(str, size) : x;
    page.drawText(str, { x: dx, y: yy, size, font, color: o.color ?? INK });
  };
  const rule = (yy: number, color = LINE, thickness = 0.75) => page.drawLine({ start: { x: M, y: yy }, end: { x: W - M, y: yy }, thickness, color });

  // ── Header: the issuer, top left, exactly as Yalla supplied it.
  text(`Invoice #${inv.number}`, M, y - 12, { size: 12, color: SOFT });
  text(invoiceIssuer.name, M, y - 36, { size: 20, font: bold });
  invoiceIssuer.lines.forEach((l, i) => text(l, M, y - 56 - i * 15, { size: 11, color: SOFT }));

  // Top right: what this is and where it stands.
  const status = inv.status === "void" ? "VOID" : t.balance <= 0 && t.total > 0 ? "PAID" : t.total === 0 ? "NO CHARGE" : "AMOUNT DUE";
  text("INVOICE", W - M, y - 14, { size: 18, font: bold, align: "right" });
  text(status, W - M, y - 32, { size: 10, font: bold, color: status === "PAID" ? BLUE : status === "VOID" ? SOFT : rgb(0.4, 0.24, 0.27), align: "right" });
  const meta: [string, string][] = [
    ["Invoice number", inv.number],
    ["Date issued", day(inv.issuedAt)],
    ...(inv.dueOn ? ([["Due", fmtDate(inv.dueOn, "MMMM d, yyyy")]] as [string, string][]) : []),
    ...(inv.periodStart && inv.periodEnd ? ([["Service period", `${fmtDate(inv.periodStart, "MMM d, yyyy")} - ${fmtDate(inv.periodEnd, "MMM d, yyyy")}`]] as [string, string][]) : []),
    ...(pays.length ? ([["Date paid", day(pays[pays.length - 1].succeededAt ?? pays[pays.length - 1].createdAt)]] as [string, string][]) : []),
  ];
  meta.forEach(([k, v], i) => {
    text(k, W - M - 150, y - 54 - i * 14, { size: 9, color: SOFT });
    text(v, W - M, y - 54 - i * 14, { size: 9, align: "right" });
  });
  y -= Math.max(56 + invoiceIssuer.lines.length * 15, 54 + meta.length * 14) + 20;
  rule(y);

  // ── Bill to.
  y -= 22;
  text("BILL TO", M, y, { size: 8, font: bold, color: SOFT });
  text("FOR", M + 270, y, { size: 8, font: bold, color: SOFT });
  y -= 15;
  const billTo = [primary ? `${primary.firstName} ${primary.lastName}` : (fam?.name ?? ""), fam?.name && primary ? fam.name : "", primary?.email ?? "", primary?.phone ?? ""].filter(Boolean);
  billTo.forEach((l, i) => text(l, M, y - i * 14, { size: 10, font: i === 0 ? bold : reg }));
  // What was bought, in words families recognize, with the booking reference for their records.
  const service = inv.bookingId ? (await checkoutLabel(db, inv.bookingId)).name : (inv.description ?? "Childcare services");
  const ref = inv.bookingId ? (await db.select({ reference: bookings.reference }).from(bookings).where(eq(bookings.id, inv.bookingId)))[0]?.reference : null;
  const forLines = [...wrap(clean(service, reg), reg, 10, W - M - (M + 270)), ...(ref ? [`Booking reference ${ref}`] : [])];
  forLines.forEach((l, i) => text(l, M + 270, y - i * 14, { size: 10 }));
  y -= Math.max(billTo.length, forLines.length) * 14 + 18;

  // ── Line items.
  const colQty = W - M - 170;
  const colUnit = W - M - 90;
  const colAmt = W - M;
  const descW = colQty - 30 - M;
  const tableHeader = () => {
    page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 20, color: rgb(0.95, 0.94, 0.92) });
    text("DESCRIPTION", M + 8, y, { size: 8, font: bold, color: SOFT });
    text("QTY", colQty, y, { size: 8, font: bold, color: SOFT, align: "right" });
    text("UNIT PRICE", colUnit, y, { size: 8, font: bold, color: SOFT, align: "right" });
    text("AMOUNT", colAmt - 8, y, { size: 8, font: bold, color: SOFT, align: "right" });
    y -= 24;
  };
  const newPage = () => {
    page = pdf.addPage([W, H]);
    y = H - M;
    text(`${invoiceIssuer.name} · Invoice #${inv.number} (continued)`, M, y - 10, { size: 9, color: SOFT });
    y -= 34;
  };
  const ensure = (needed: number) => {
    if (y - needed < M + 40) {
      newPage();
      return true;
    }
    return false;
  };
  tableHeader();
  const kindLabel: Record<string, string> = { discount: "Discount", fee: "Fee", tax: "Tax", adjustment: "Adjustment" };
  for (const l of lines) {
    const desc = wrap(clean(l.description, reg), reg, 10, descW);
    const h = desc.length * 13 + (kindLabel[l.kind] ? 11 : 0) + 14;
    if (ensure(h)) tableHeader();
    const color = l.kind === "discount" ? BLUE : INK;
    desc.forEach((d, i) => text(d, M + 8, y - i * 13, { size: 10, color }));
    if (kindLabel[l.kind]) text(kindLabel[l.kind], M + 8, y - desc.length * 13, { size: 7.5, color: SOFT });
    text(String(l.quantity), colQty, y, { size: 10, align: "right", color });
    text(usd(l.unitCents), colUnit, y, { size: 10, align: "right", color });
    text(usd(l.amountCents), colAmt - 8, y, { size: 10, align: "right", color });
    // The divider sits under the row's last line (or its small label), then the next row starts.
    const bottom = y - (desc.length - 1) * 13 - (kindLabel[l.kind] ? 11 : 0) - 8;
    page.drawLine({ start: { x: M, y: bottom }, end: { x: W - M, y: bottom }, thickness: 0.5, color: LINE });
    y = bottom - 16;
  }

  // ── Totals, right aligned.
  const totals: [string, number, boolean?][] = [["Subtotal", t.charges]];
  if (t.discounts) totals.push(["Discounts", t.discounts]);
  if (t.tax) totals.push(["Tax", t.tax]);
  if (t.adjustments) totals.push(["Adjustments", t.adjustments]);
  totals.push(["Total", t.total, true]);
  if (t.walletApplied) totals.push(["Paid from Play Pass", -t.walletApplied]);
  if (t.creditApplied - t.walletApplied > 0) totals.push(["Paid from Yalla Wallet credit", -(t.creditApplied - t.walletApplied)]);
  if (t.paid) totals.push(["Payments received", -t.paid]);
  if (t.refunded) totals.push(["Refunded", t.refunded]);
  totals.push([inv.status === "void" ? "Balance (void)" : "Balance due", Math.max(t.balance, 0), true]);
  ensure(totals.length * 18 + 20);
  y -= 8;
  for (const [label, cents, strong] of totals) {
    if (strong) {
      page.drawLine({ start: { x: W - M - 230, y: y + 13 }, end: { x: W - M, y: y + 13 }, thickness: 0.75, color: INK });
    }
    text(label, W - M - 230, y, { size: strong ? 11 : 10, font: strong ? bold : reg });
    text(usd(cents), colAmt - 8, y, { size: strong ? 11 : 10, font: strong ? bold : reg, align: "right" });
    y -= strong ? 22 : 17;
  }

  // ── Payments and refunds.
  if (pays.length || refs.length) {
    ensure(40 + (pays.length + refs.length) * 15);
    y -= 14;
    text("PAYMENT HISTORY", M, y, { size: 8, font: bold, color: SOFT });
    y -= 6;
    rule(y);
    y -= 15;
    const method: Record<string, string> = { card: "Card", offline_cash: "Cash", offline_check: "Check", offline_other: "Other", credit: "Yalla Wallet credit" };
    for (const p of pays) {
      text(day(p.succeededAt ?? p.createdAt), M, y, { size: 10 });
      text(`Payment · ${method[p.method] ?? p.method}`, M + 150, y, { size: 10 });
      text(usd(p.amountCents), colAmt - 8, y, { size: 10, align: "right" });
      y -= 15;
    }
    for (const r of refs) {
      text(day(r.createdAt), M, y, { size: 10 });
      text("Refund", M + 150, y, { size: 10 });
      text(usd(-r.amountCents), colAmt - 8, y, { size: 10, align: "right" });
      y -= 15;
    }
  }

  // ── Footer on every page.
  const pages = pdf.getPages();
  pages.forEach((pg, i) => {
    page = pg;
    rule(M + 22);
    text(`Thank you for choosing Yalla. Questions about this invoice: hello@yallaspacesd.com · 619.775.4008`, M, M + 8, { size: 8, color: SOFT });
    text(`Page ${i + 1} of ${pages.length}`, W - M, M + 8, { size: 8, color: SOFT, align: "right" });
  });

  return { bytes: await pdf.save(), filename: `Yalla-invoice-${inv.number}.pdf`, familyId: inv.familyId };
}

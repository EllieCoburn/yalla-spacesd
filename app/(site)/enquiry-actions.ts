"use server";

import { OpsError } from "@/lib/audit";
import { getDb, isDbConfigured } from "@/lib/db";
import { submitEnquiry, type EnquiryKind } from "@/lib/ops/enquiries";
import { requestContext } from "./portal/session";

export type EnquiryState = { ok?: boolean; error?: string; at?: number } | undefined;

const ONSITE: Record<string, string> = { me: "Me", partner: "My partner or co-parent", both: "Both of us" };
const BEGIN: Record<string, string> = { next: "Next cohort year (August)", soonest: "Soonest available spot" };
const FLEX: Record<string, string> = { set: "These days are set", some: "Somewhat flexible", any: "Any days work" };
const LENGTH: Record<string, string> = { full: "Full day (8:30 – 4:30)", half: "Half day (8:30 – 12:00)", custom: "Custom hours" };

/** The questions each website form asks, as label → answer, in order. */
function detailsFor(kind: EnquiryKind, f: FormData) {
  const v = (k: string) => String(f.get(k) ?? "").trim();
  if (kind === "tour")
    return [
      { label: "Child’s age or due date", value: v("childAge") },
      { label: "Interested in", value: v("interests") },
      { label: "Days or times that suit them", value: v("when") },
      { label: "Message", value: v("message") },
    ];
  if (kind === "event")
    return [
      { label: "Occasion", value: v("occasion") },
      { label: "Preferred date", value: v("date") },
      { label: "Approximate guests", value: v("guests") },
      { label: "Message", value: v("message") },
    ];
  // Club Yalla application
  const kids: { label: string; value: string }[] = [];
  for (let i = 1; i <= 8; i++) {
    const name = v(`childName${i}`);
    if (name) kids.push({ label: `Child ${i}`, value: `${name}, born or due ${v(`childBirth${i}`) || "—"}` });
  }
  return [
    { label: "Work", value: v("work") },
    ...kids,
    { label: "Ideal start date", value: v("start") },
    { label: "Working onsite", value: ONSITE[v("onsite")] ?? v("onsite") },
    { label: "When they’d like to begin", value: BEGIN[v("begin")] ?? "" },
    { label: "Days per week", value: v("days") },
    { label: "Preferred days", value: v("weekdays") },
    { label: "Flexibility", value: FLEX[v("flex")] ?? "" },
    { label: "Day length", value: LENGTH[v("length")] ?? "" },
    { label: "Message", value: v("message") },
  ];
}

/** Tour requests, Club Yalla applications and event enquiries from the public website. */
export async function submitEnquiryAction(_: EnquiryState, form: FormData): Promise<EnquiryState> {
  const kind = String(form.get("kind")) as EnquiryKind;
  if (!["tour", "application", "event"].includes(kind)) return { error: "Something went wrong. Please try again.", at: Date.now() };
  // Hidden field people never see. Browsers can still autofill it, so a filled one is only a hint:
  // the message is always saved, just flagged and without the automatic reply.
  const suspect = Boolean(String(form.get("yx_hp") ?? form.get("company") ?? "").trim());
  if (!isDbConfigured()) return { error: "We couldn’t send this right now. Please email hello@yallaspacesd.com or call 619.775.4008.", at: Date.now() };
  try {
    const { baseUrl, ip } = await requestContext();
    await submitEnquiry(getDb(), {
      kind,
      name: String(form.get(kind === "application" ? "parentName" : "name") ?? ""),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      details: [...detailsFor(kind, form), ...(suspect ? [{ label: "Note", value: "Possibly automated (a hidden field was filled). Check before replying." }] : [])],
      ip,
      baseUrl,
      confirmToFamily: !suspect,
    });
    return { ok: true, at: Date.now() };
  } catch (e) {
    if (e instanceof OpsError) return { error: e.message, at: Date.now() };
    console.error("[enquiry failed]", (e as Error).message?.slice(0, 200));
    return { error: "We couldn’t send this right now. Please email hello@yallaspacesd.com or call 619.775.4008.", at: Date.now() };
  }
}

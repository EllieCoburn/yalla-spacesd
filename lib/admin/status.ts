/**
 * One vocabulary for statuses across the portal. Every status has a text label and an icon
 * shape, so meaning never depends on colour alone.
 */
export type Tone = "positive" | "neutral" | "info" | "warning" | "critical" | "muted";
export type Icon = "check" | "dot" | "clock" | "alert" | "x" | "minus" | "arrow";

type S = { label: string; tone: Tone; icon: Icon };

export const STATUS = {
  booking: {
    held: { label: "Held", tone: "info", icon: "clock" },
    pending_payment: { label: "Awaiting payment", tone: "warning", icon: "clock" },
    requested: { label: "Awaiting approval", tone: "warning", icon: "clock" },
    confirmed: { label: "Confirmed", tone: "positive", icon: "check" },
    cancelled: { label: "Cancelled", tone: "muted", icon: "x" },
    expired: { label: "Expired hold", tone: "muted", icon: "minus" },
    needs_attention: { label: "Needs attention", tone: "critical", icon: "alert" },
  },
  item: {
    held: { label: "Held", tone: "info", icon: "clock" },
    confirmed: { label: "Confirmed", tone: "positive", icon: "check" },
    cancelled: { label: "Cancelled", tone: "muted", icon: "x" },
    moved: { label: "Moved", tone: "muted", icon: "arrow" },
  },
  attendance: {
    expected: { label: "Expected", tone: "neutral", icon: "dot" },
    present: { label: "Present", tone: "positive", icon: "check" },
    checked_in: { label: "Checked in", tone: "positive", icon: "check" },
    checked_out: { label: "Checked out", tone: "muted", icon: "arrow" },
    absent: { label: "Absent", tone: "warning", icon: "minus" },
    no_show: { label: "No-show", tone: "critical", icon: "x" },
    late_cancel: { label: "Late cancel", tone: "warning", icon: "x" },
  },
  payment: {
    pending: { label: "Pending", tone: "info", icon: "clock" },
    succeeded: { label: "Paid", tone: "positive", icon: "check" },
    failed: { label: "Failed", tone: "critical", icon: "alert" },
    cancelled: { label: "Abandoned", tone: "muted", icon: "minus" },
  },
  invoice: {
    draft: { label: "Draft", tone: "muted", icon: "minus" },
    open: { label: "Unpaid", tone: "warning", icon: "clock" },
    paid: { label: "Paid", tone: "positive", icon: "check" },
    void: { label: "Void", tone: "muted", icon: "x" },
    uncollectible: { label: "Uncollectible", tone: "critical", icon: "x" },
  },
  refund: {
    pending: { label: "Refund pending", tone: "info", icon: "clock" },
    succeeded: { label: "Refunded", tone: "neutral", icon: "check" },
    failed: { label: "Refund failed", tone: "critical", icon: "alert" },
  },
  paperwork: {
    complete: { label: "Complete", tone: "positive", icon: "check" },
    missing: { label: "Missing", tone: "critical", icon: "alert" },
    unsigned: { label: "Awaiting signature", tone: "warning", icon: "clock" },
    expired: { label: "Expired", tone: "critical", icon: "alert" },
    needs_resign: { label: "New version to sign", tone: "warning", icon: "alert" },
  },
  membership: {
    upcoming: { label: "Upcoming", tone: "info", icon: "clock" },
    active: { label: "Active", tone: "positive", icon: "check" },
    paused: { label: "Paused", tone: "warning", icon: "minus" },
    ended: { label: "Ended", tone: "muted", icon: "x" },
  },
  waitlist: {
    waiting: { label: "Waiting", tone: "neutral", icon: "dot" },
    offered: { label: "Offer sent", tone: "info", icon: "clock" },
    accepted: { label: "Accepted", tone: "positive", icon: "check" },
    expired: { label: "Offer expired", tone: "muted", icon: "minus" },
    declined: { label: "Declined", tone: "muted", icon: "x" },
    removed: { label: "Removed", tone: "muted", icon: "x" },
  },
  program: {
    draft: { label: "Draft", tone: "muted", icon: "minus" },
    published: { label: "Published", tone: "positive", icon: "check" },
    paused: { label: "Paused", tone: "warning", icon: "minus" },
    archived: { label: "Archived", tone: "muted", icon: "x" },
  },
  session: {
    scheduled: { label: "Scheduled", tone: "neutral", icon: "dot" },
    closed: { label: "Closed", tone: "warning", icon: "minus" },
    cancelled: { label: "Cancelled", tone: "muted", icon: "x" },
  },
  message: {
    captured: { label: "Captured (test mode)", tone: "info", icon: "dot" },
    queued: { label: "Queued", tone: "info", icon: "clock" },
    sent: { label: "Sent", tone: "positive", icon: "check" },
    delivered: { label: "Delivered", tone: "positive", icon: "check" },
    failed: { label: "Failed", tone: "critical", icon: "alert" },
  },
} satisfies Record<string, Record<string, S>>;

export type StatusKind = keyof typeof STATUS;

export function statusOf(kind: StatusKind, value: string | null | undefined): S {
  const map = STATUS[kind] as Record<string, S>;
  return (value && map[value]) || { label: value ? value.replace(/_/g, " ") : "—", tone: "muted", icon: "minus" };
}

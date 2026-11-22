/**
 * The branded HTML version of every email. Templates stay plain text (easy to edit in Admin →
 * Communications), and this turns them into a designed email:
 * - "Hi Name," becomes the greeting, the subject becomes the headline
 * - blocks of "Label: value" lines become a details card, "• item" lines a list
 * - a link on its own line (or after "…: ") becomes a button
 * - the closing "Yalla" becomes the sign-off
 * The plain text is still sent alongside for email apps that prefer it.
 */
import { site } from "@/content/site";

const C = {
  page: "#f7f5ef",
  card: "#fffdf9",
  ink: "#292c45",
  soft: "#5a5d74",
  blue: "#6065f2",
  mist: "#eeedf6",
  sand: "#f1ede4",
  line: "#e6e1d6",
  oxblood: "#673e46",
  rose: "#f3e6e8",
};

/** Team emails with a status: a colored bar across the top of the card and a status chip. */
const STATUS: Record<string, { label: string; color: string; tint: string }> = {
  staff_new_booking: { label: "Confirmed", color: "#6065f2", tint: "#eeedf6" },
  staff_booking_cancelled: { label: "Cancelled", color: "#673e46", tint: "#f3e6e8" },
  cohort_drop_in: { label: "Drop-in", color: "#6065f2", tint: "#eeedf6" },
  cohort_drop_in_cancelled: { label: "Cancelled", color: "#673e46", tint: "#f3e6e8" },
  booking_confirmation: { label: "Confirmed", color: "#6065f2", tint: "#eeedf6" },
  booking_confirmed_team: { label: "Confirmed", color: "#6065f2", tint: "#eeedf6" },
  booking_welcome_team: { label: "Confirmed", color: "#6065f2", tint: "#eeedf6" },
  booking_cancellation: { label: "Cancelled", color: "#673e46", tint: "#f3e6e8" },
};
const SERIF = `Lora, 'Iowan Old Style', Georgia, 'Times New Roman', serif`;
const SANS = `'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;

/** Where the email images live. Always the public site, so they load in every inbox. */
export function assetBase() {
  return (process.env.EMAIL_ASSET_BASE_URL || "https://www.yallaspacesd.com").replace(/\/$/, "");
}

const HERO: Record<string, string> = {
  enquiry_received: "hero-space.jpg",
  tour_received: "hero-space.jpg",
  family_welcome: "hero-paint.jpg",
  family_invite: "hero-paint.jpg",
  family_added: "hero-paint.jpg",
  flex_hold_notice: "hero-paint.jpg",
  application_received: "hero-rainbow.jpg",
  event_received: "hero-sunflowers.jpg",
  playpass_welcome: "hero-rainbow.jpg",
  booking_confirmation: "hero-rainbow.jpg",
  booking_welcome_team: "hero-rainbow.jpg",
  flex_welcome: "hero-rainbow.jpg",
  camp_welcome: "hero-sunflowers.jpg",
  flex_thank_you: "hero-sunflowers.jpg",
  space_confirmation: "hero-space.jpg",
  waitlist_offer: "hero-rainbow.jpg",
};

const BUTTON: Record<string, string> = {
  family_sign_in: "Sign in to the Family Portal",
  family_confirm_email: "Confirm my email and open my portal",
  family_invite: "Create your Family Portal account",
  family_added: "Set up my account",
  flex_hold_notice: "See available Flex days",
  booking_confirmation: "View my booking",
  booking_cancellation: "Book another experience",
  booking_welcome_team: "Set up my Family Portal",
  booking_confirmed_team: "View my bookings",
  payment_request: "Pay securely",
  waitlist_offer: "Book spot now",
  waitlist_update: "Book another Flex day",
  staff_new_enquiry: "Open in the Inbox",
  staff_password_reset: "Choose a new password",
  family_welcome: "Open the Family Portal",
  staff_family_joined: "Open their family record",
  staff_new_booking: "Open the booking",
  staff_booking_cancelled: "Open the booking",
  cohort_drop_in: "See upcoming drop-ins",
  cohort_drop_in_cancelled: "See upcoming drop-ins",
  staff_invite: "Set your password",
  payment_receipt: "Book more with Yalla",
  flex_thank_you: "Book your next Flex day",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const URL_ONLY = /^https?:\/\/\S+$/;
const LABEL_LINE = /^([^:•\n]{1,48}):\s+(.+)$/;
const SIGN_OFF = /^(yalla|warmly,?|thank you,?|with love,?|we can.t wait to play,?|see you soon,?)$/i;

const MD_LINK = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

/** The text version: "[words](link)" becomes "words: link". */
export function plainText(body: string) {
  return body
    .replace(/^%%\s+(\S+)\s*\|\s*(\S+)$/gm, "Your code: $1 (copy it here: $2)")
    .replace(/^\$\$=\s+(.+?)\s*\|\s*(.+)$/gm, "$1: $2")
    .replace(/^\$\$-?\s+(.+?)\s*\|\s*(.+)$/gm, "$1 · $2")
    .replace(/^>>\s+/gm, "")
    .replace(/^~~\s+/gm, "")
    .replace(/^!!\s+(.+?)\s*\|\s*(.+)$/gm, "$1 $2")
    .replace(/^!!\s+/gm, "").replace(MD_LINK, "$1: $2").replace(/^#{1,3}\s+/gm, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/\n{3,}/g, "\n\n").trim();
}

/** A template can start with "# Headline" to use a headline other than the subject. */
export function splitHeadline(body: string, subject: string) {
  const m = body.replace(/^\s+/, "").match(/^#\s+(.+)\n*/);
  return m ? { headline: m[1].trim(), rest: body.replace(/^\s+/, "").slice(m[0].length) } : { headline: subject, rest: body };
}

/** Escapes text and turns "[words](link)", emails, phone numbers and web links into tappable links. */
function inline(text: string) {
  const links: string[] = [];
  const tokened = text.replace(MD_LINK, (_, t, u) => {
    links.push(`<a href="${esc(u)}" style="color:${C.blue};text-decoration:underline;">${esc(t)}</a>`);
    return `\u0000${links.length - 1}\u0000`;
  });
  return linkify(esc(tokened))
    .replace(/\*\*(.+?)\*\*/g, `<strong style="font-weight:500;">$1</strong>`)
    .replace(/\u0000(\d+)\u0000/g, (_, i) => links[Number(i)]);
}

function linkify(html: string) {
  return html
    .replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (u) => `<a href="${u}" style="color:${C.blue};text-decoration:underline;word-break:break-all;">${u}</a>`)
    .replace(/(^|[\s(])([\w.+-]+@[\w-]+\.[\w.-]+\w)/g, (_, pre, e) => `${pre}<a href="mailto:${e}" style="color:${C.blue};text-decoration:none;">${e}</a>`)
    .replace(/(^|[\s(])(\(?\d{3}\)?[.\s-]?\d{3}[.\s-]\d{4})(?=$|[\s.,)])/g, (_, pre, p) => `${pre}<a href="tel:+1${p.replace(/\D/g, "")}" style="color:${C.blue};text-decoration:none;">${p}</a>`);
}

function button(href: string, label: string) {
  return `<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:10px auto 26px;"><tr><td style="border-radius:999px;background:${C.ink};">
<a href="${esc(href)}" style="display:inline-block;padding:15px 30px;font-family:${SANS};font-size:15px;letter-spacing:0.03em;color:#ffffff;text-decoration:none;border-radius:999px;">${esc(label)}</a>
</td></tr></table>`;
}

const p = (html: string, extra = "") => `<p style="margin:0 0 18px;font-family:${SANS};font-size:16px;line-height:1.65;color:${C.ink};${extra}">${html}</p>`;

function detailsCard(lines: string[]) {
  const rows = lines
    .map((l) => {
      const bullet = l.match(/^[•\-*]\s*(.+)$/);
      if (bullet)
        return `<tr><td colspan="2" style="padding:7px 0;font-family:${SANS};font-size:15px;line-height:1.5;color:${C.ink};"><span style="color:${C.blue};">●</span>&nbsp;&nbsp;${inline(bullet[1])}</td></tr>`;
      const m = l.match(LABEL_LINE);
      if (m)
        return `<tr><td valign="top" width="120" style="width:120px;padding:7px 16px 7px 0;font-family:${SANS};font-size:13px;line-height:1.5;letter-spacing:0.02em;color:${C.soft};white-space:nowrap;">${esc(m[1])}</td><td valign="top" style="padding:7px 0;font-family:${SANS};font-size:15px;line-height:1.5;color:${C.ink};">${inline(m[2])}</td></tr>`;
      return `<tr><td colspan="2" style="padding:7px 0;font-family:${SANS};font-size:15px;line-height:1.5;color:${C.ink};">${inline(l)}</td></tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;background:${C.sand};border-radius:18px;"><tr><td style="padding:18px 22px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr></table>`;
}

/**
 * An itemized receipt: "$$ Item | $160.00" rows, "$$- Discount | −$80.00" discount rows (in blue)
 * and "$$= Total | $80.00" totals (bold, with a rule above each one that follows other rows).
 */
function receiptTable(lines: string[]) {
  let prev = "";
  const rows = lines
    .map((l) => {
      const m = l.match(/^\$\$([-=]?)\s+(.+?)\s*\|\s*(.+)$/);
      if (!m) return "";
      const [, kind, label, amount] = m;
      const total = kind === "=";
      const rule = total && prev !== "=" ? `border-top:1px solid ${C.line};` : "";
      prev = kind;
      const color = kind === "-" ? C.blue : C.ink;
      const weight = total ? "font-weight:600;" : "";
      const pad = rule ? "12px" : "7px";
      return `<tr><td valign="top" style="${rule}padding:${pad} 16px 7px 0;font-family:${SANS};font-size:15px;line-height:1.5;color:${color};${weight}">${inline(label)}</td><td valign="top" align="right" style="${rule}padding:${pad} 0 7px;font-family:${SANS};font-size:15px;line-height:1.5;color:${color};white-space:nowrap;${weight}">${esc(amount)}</td></tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;background:${C.sand};border-radius:18px;"><tr><td style="padding:18px 22px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr></table>`;
}

/**
 * "%% BACKTOPLAY10 | https://…/coupon/BACKTOPLAY10": a coupon code set apart from everything else:
 * large, letter-spaced, in a dashed box, with a "Copy code" button (email apps can't copy to the
 * clipboard themselves, so the button opens a page with a one-tap copy). The code itself is
 * selectable as one piece too.
 */
function couponBlock(code: string, href: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 26px;"><tr><td align="center" style="padding:24px 18px;background:${C.mist};border:2px dashed ${C.blue};border-radius:18px;">
<p style="margin:0 0 6px;font-family:${SANS};font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:${C.soft};">Your code</p>
<p style="margin:0 0 16px;font-family:'Courier New',Courier,monospace;font-size:30px;font-weight:700;letter-spacing:0.12em;color:${C.ink};-webkit-user-select:all;user-select:all;">${esc(code)}</p>
<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:999px;background:${C.blue};">
<a href="${esc(href)}" style="display:inline-block;padding:11px 24px;font-family:${SANS};font-size:14px;letter-spacing:0.03em;color:#ffffff;text-decoration:none;border-radius:999px;">Copy code</a>
</td></tr></table>
</td></tr></table>`;
}

/** ">> Camp Yalla · 4 – 6 years": the thing a team email is about, set large. */
function subjectLine(text: string, sub?: string) {
  return `<p style="margin:6px 0 ${sub ? "4px" : "16px"};font-family:${SERIF};font-size:24px;line-height:1.25;color:${C.ink};">${inline(text)}</p>${sub ? `<p style="margin:0 0 18px;font-family:${SANS};font-size:15px;line-height:1.5;color:${C.soft};">${inline(sub)}</p>` : ""}`;
}

/** "!! 6 | spots left in this age group": a big number with a short explanation beside it. */
function statCallout(big: string, small: string, key: string) {
  const st = STATUS[key] ?? { color: C.blue, tint: C.mist };
  const full = /^full$/i.test(big.trim());
  const color = full ? C.oxblood : st.color;
  const tint = full ? C.rose : st.tint;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;background:${tint};border-radius:18px;"><tr>
<td valign="middle" style="padding:16px 4px 16px 22px;width:1%;white-space:nowrap;font-family:${SERIF};font-size:38px;line-height:1;color:${color};">${esc(big)}</td>
<td valign="middle" style="padding:16px 22px 16px 14px;font-family:${SANS};font-size:15px;line-height:1.45;color:${C.ink};">${inline(small)}</td>
</tr></table>`;
}

/** "~~ a short note": a soft callout for anything worth a second look. */
function noteCallout(text: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;"><tr><td style="padding:12px 18px;border-left:3px solid ${C.line};font-family:${SANS};font-size:15px;line-height:1.55;color:${C.soft};">${inline(text)}</td></tr></table>`;
}

/** Turns a plain-text template into the email's inner content. */
export function bodyHtml(body: string, key: string) {
  const blocks = body
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((b) => b.split("\n").map((l) => l.trim()).filter(Boolean))
    .filter((b) => b.length);
  const out: string[] = [];
  // What each piece of `out` is, so the closing after the last button can be centered.
  const kinds: ("para" | "button" | "other")[] = [];
  const push = (html: string, kind: "para" | "button" | "other" = "other") => {
    out.push(html);
    kinds.push(kind);
  };
  const label = BUTTON[key] ?? "Open";

  // The sign-off: the last block if it's short and ends with "Yalla" (or is a closing phrase).
  let signOff: string[] | null = null;
  const last = blocks[blocks.length - 1];
  if (last && last.length <= 2 && last.every((l) => SIGN_OFF.test(l) || l.length < 28) && /yalla$/i.test(last[last.length - 1])) signOff = blocks.pop()!;

  blocks.forEach((b, i) => {
    // "## Section heading" and "### Smaller heading" lines.
    const headed = /^###\s+/.test(b[0] ?? "");
    while (b.length && /^#{2,3}\s+/.test(b[0])) {
      const line = b.shift()!;
      if (/^###\s+/.test(line)) push(`<p style="margin:22px 0 8px;font-family:${SANS};font-size:12px;font-weight:500;letter-spacing:0.16em;text-transform:uppercase;color:${C.blue};">${esc(line.replace(/^###\s+/, ""))}</p>`);
      else push(`<p style="margin:34px 0 4px;padding-top:26px;border-top:1px solid ${C.line};font-family:${SERIF};font-size:23px;line-height:1.3;color:${C.ink};">${esc(line.replace(/^##\s+/, ""))}</p>`);
    }
    if (!b.length) return;
    // A sign-off in the middle of an email (a letter followed by more details).
    if (b.length === 2 && SIGN_OFF.test(b[0]) && /^team yalla$/i.test(b[1])) {
      push(
        `<p style="margin:8px 0 0;font-family:${SANS};font-size:16px;line-height:1.6;color:${C.ink};">${esc(b[0])}</p>` +
          `<p style="margin:2px 0 10px;font-family:${SERIF};font-style:italic;font-size:24px;line-height:1.3;color:${C.blue};">${esc(b[1])}</p>`,
      );
      return;
    }
    if (/^>>\s+/.test(b[0])) {
      push(subjectLine(b[0].replace(/^>>\s+/, ""), b[1]));
      return;
    }
    const coupon = b.length === 1 ? b[0].match(/^%%\s+(\S+)\s*\|\s*(https?:\/\/\S+)$/) : null;
    if (coupon) {
      push(couponBlock(coupon[1], coupon[2]));
      return;
    }
    if (b.every((l) => /^\$\$[-=]?\s+/.test(l))) {
      push(receiptTable(b));
      return;
    }
    if (b.every((l) => /^(!!|~~)\s+/.test(l))) {
      for (const l of b) {
        const stat = l.match(/^!!\s+(.+?)\s*\|\s*(.+)$/);
        if (stat) push(statCallout(stat[1], stat[2], key));
        else push(noteCallout(l.replace(/^(!!|~~)\s+/, "")));
      }
      return;
    }
    if (i === 0 && b.length === 1 && /^(hi|hello|dear)\b.*,$/i.test(b[0])) {
      push(`<p style="margin:0 0 18px;font-family:${SERIF};font-size:20px;line-height:1.4;color:${C.ink};">${esc(b[0])}</p>`);
      return;
    }
    const isDetails = b.every((l) => LABEL_LINE.test(l) || /^[•\-*]\s/.test(l)) && !b.some((l) => /:\s*https?:\/\//.test(l));
    if (isDetails && (b.length > 1 || headed || /^[•\-*]\s/.test(b[0]))) {
      push(detailsCard(b));
      return;
    }
    // Paragraphs, with any bare link (or "Text: link") turned into a button.
    let para: string[] = [];
    const flush = () => {
      if (para.length) push(p(para.map(inline).join("<br>")), "para");
      para = [];
    };
    for (const l of b) {
      if (URL_ONLY.test(l)) {
        flush();
        push(button(l, label), "button");
        continue;
      }
      const tail = l.match(/^(.*?):\s*(https?:\/\/\S+)$/);
      if (tail) {
        para.push(`${tail[1]}.`.replace(/\.\.$/, "."));
        flush();
        push(button(tail[2], label), "button");
        continue;
      }
      para.push(l);
    }
    flush();
  });

  // When an email ends with a button followed only by short closing lines, center that closing
  // (and the sign-off) under the button, so the ending reads as one piece.
  const lastButton = kinds.lastIndexOf("button");
  const centerClosing = lastButton >= 0 && kinds.slice(lastButton + 1).every((k) => k === "para");
  if (centerClosing) for (let i = lastButton + 1; i < out.length; i++) out[i] = out[i].replace('<p style="', '<p style="text-align:center;');
  // A short lead-in that introduces the closing button ("…for your family:") sits centered above it too.
  if (centerClosing && kinds[lastButton - 1] === "para" && /:<\/p>$/.test(out[lastButton - 1])) out[lastButton - 1] = out[lastButton - 1].replace('<p style="', '<p style="text-align:center;');
  if (signOff) {
    const [lead, name] = signOff.length === 2 ? signOff : [null, signOff[0]];
    const signature = /^yalla$/i.test(name.trim()) ? "Team Yalla" : name;
    // Every sign-off is centered; so is a short closing line right above it ("We can’t wait to see you.").
    const last = out.length - 1;
    if (!centerClosing && kinds[last] === "para" && out[last].replace(/<[^>]+>/g, "").length <= 120) out[last] = out[last].replace('<p style="', '<p style="text-align:center;');
    const align = "text-align:center;";
    out.push(
      `<p style="${align}margin:8px 0 0;font-family:${SANS};font-size:16px;line-height:1.6;color:${C.ink};">${lead ? esc(lead) : "Warmly,"}</p>` +
        `<p style="${align}margin:2px 0 0;font-family:${SERIF};font-style:italic;font-size:24px;line-height:1.3;color:${C.blue};">${esc(signature)}</p>`,
    );
  }
  return out.join("\n");
}

/** The full designed email. */
export function emailHtml(input: { key: string; subject: string; body: string; audience: "family" | "billing" | "staff" }) {
  const base = assetBase();
  const staff = input.audience === "staff";
  const hero = !staff ? HERO[input.key] : undefined;
  const status = STATUS[input.key];
  const { headline, rest } = splitHeadline(input.body, input.subject);
  const preheader = plainText(rest)
    .replace(/^(hi|hello|dear)[^\n]*\n+/i, "")
    .replace(/\s+/g, " ")
    .slice(0, 110);
  const footer = staff
    ? `Sent by the Yalla website to the team.`
    : [
        `<a href="${base}" style="color:${C.soft};text-decoration:none;font-family:${SERIF};font-style:italic;font-size:15px;">${esc(site.fullName)}</a>`,
        site.address.value ? esc(site.address.value) : "",
        [site.phone.value ? `<a href="tel:+1${site.phone.value.replace(/\D/g, "")}" style="color:${C.soft};text-decoration:none;">${esc(site.phone.value)}</a>` : "", `<a href="mailto:${site.email.value}" style="color:${C.soft};text-decoration:none;">${esc(site.email.value)}</a>`]
          .filter(Boolean)
          .join("&nbsp;&nbsp;·&nbsp;&nbsp;"),
        `<a href="${base}/portal" style="color:${C.blue};text-decoration:none;">Family Portal</a>`,
      ]
        .filter(Boolean)
        .join("<br>");
  // Round buttons for Instagram, Pinterest and the Amazon storefront, like the website's (images, so
  // they look the same in every email app).
  const socials = staff
    ? ""
    : [
        { href: site.instagram.value, icon: "instagram", alt: "Yalla on Instagram" },
        { href: site.pinterest.value, icon: "pinterest", alt: "Yalla on Pinterest" },
        { href: site.amazon.value, icon: "amazon", alt: "Yalla’s Amazon storefront" },
      ]
        .filter((x) => x.href)
        .map(
          (x) =>
            `<td style="padding:0 6px;"><a href="${x.href}" style="text-decoration:none;"><img src="${base}/email/social-${x.icon}.png" width="40" height="40" alt="${esc(x.alt)}" style="display:block;border:0;width:40px;height:40px;"></a></td>`,
        )
        .join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${esc(input.subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500&family=Lora:ital,wght@0,400;0,500;1,400&display=swap" rel="stylesheet">
<style>
  body{margin:0;padding:0;background:${C.page};}
  a{color:${C.blue};}
  @media (max-width:620px){ .px{padding-left:24px!important;padding-right:24px!important;} .h1{font-size:28px!important;} }
</style></head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.page};">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};"><tr><td align="center" style="padding:32px 12px 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
  <tr><td align="center" style="padding:0 0 22px;"><a href="${base}"><img src="${base}/email/logo.png" width="84" height="85" alt="Yalla" style="display:block;border:0;width:84px;height:auto;"></a></td></tr>
  <tr><td style="background:${C.card};border-radius:28px;overflow:hidden;border:1px solid ${C.line};">
    ${status && !hero ? `<div style="height:8px;background:${status.color};border-radius:28px 28px 0 0;font-size:0;line-height:0;">&nbsp;</div>` : ""}
    ${hero ? `<img src="${base}/email/${hero}" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:28px 28px 0 0;">` : ""}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="px" style="padding:${hero ? "36px" : "44px"} 48px 40px;">
      ${
        status
          ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;"><tr><td style="padding:5px 12px;border-radius:999px;background:${status.tint};font-family:${SANS};font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${status.color};">●&nbsp; ${status.label}</td><td style="padding-left:12px;font-family:${SANS};font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:${C.soft};">${staff ? "Yalla · Team" : "Yalla"}</td></tr></table>`
          : `<p style="margin:0 0 12px;font-family:${SANS};font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:${C.blue};">${staff ? "Yalla · Team" : "Yalla Coworking &amp; Childcare"}</p>`
      }
      <h1 class="h1" style="margin:0 0 26px;font-family:${SERIF};font-weight:400;font-size:32px;line-height:1.2;color:${C.ink};">${esc(headline)}</h1>
      ${bodyHtml(rest, input.key)}
    </td></tr></table>
  </td></tr>
  <tr><td align="center" style="padding:28px 24px 0;font-family:${SANS};font-size:13px;line-height:1.8;color:${C.soft};">${footer}</td></tr>
  ${socials ? `<tr><td align="center" style="padding:16px 24px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${socials}</tr></table></td></tr>` : ""}
</table>
</td></tr></table>
</body></html>`;
}

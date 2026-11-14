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
  application_received: "hero-rainbow.jpg",
  event_received: "hero-sunflowers.jpg",
  playpass_welcome: "hero-rainbow.jpg",
  booking_confirmation: "hero-rainbow.jpg",
  space_confirmation: "hero-space.jpg",
  waitlist_offer: "hero-rainbow.jpg",
};

const BUTTON: Record<string, string> = {
  family_sign_in: "Sign in to the Family Portal",
  payment_request: "Pay securely",
  waitlist_offer: "Claim this spot",
  staff_new_enquiry: "Open in the Inbox",
  staff_password_reset: "Choose a new password",
  staff_invite: "Set your password",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const URL_ONLY = /^https?:\/\/\S+$/;
const LABEL_LINE = /^([^:•\n]{1,48}):\s+(.+)$/;
const SIGN_OFF = /^(yalla|warmly,?|thank you,?|with love,?|we can.t wait to play,?|see you soon,?)$/i;

const MD_LINK = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

/** The text version: "[words](link)" becomes "words: link". */
export function plainText(body: string) {
  return body.replace(MD_LINK, "$1: $2").replace(/\n{3,}/g, "\n\n").trim();
}

/** Escapes text and turns "[words](link)", emails, phone numbers and web links into tappable links. */
function inline(text: string) {
  const links: string[] = [];
  const tokened = text.replace(MD_LINK, (_, t, u) => {
    links.push(`<a href="${esc(u)}" style="color:${C.blue};text-decoration:underline;">${esc(t)}</a>`);
    return `\u0000${links.length - 1}\u0000`;
  });
  return linkify(esc(tokened)).replace(/\u0000(\d+)\u0000/g, (_, i) => links[Number(i)]);
}

function linkify(html: string) {
  return html
    .replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (u) => `<a href="${u}" style="color:${C.blue};text-decoration:underline;word-break:break-all;">${u}</a>`)
    .replace(/(^|[\s(])([\w.+-]+@[\w-]+\.[\w.-]+\w)/g, (_, pre, e) => `${pre}<a href="mailto:${e}" style="color:${C.blue};text-decoration:none;">${e}</a>`)
    .replace(/(^|[\s(])(\(?\d{3}\)?[.\s-]?\d{3}[.\s-]\d{4})(?=$|[\s.,)])/g, (_, pre, p) => `${pre}<a href="tel:+1${p.replace(/\D/g, "")}" style="color:${C.blue};text-decoration:none;">${p}</a>`);
}

function button(href: string, label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr><td style="border-radius:999px;background:${C.ink};">
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
        return `<tr><td valign="top" style="padding:7px 16px 7px 0;font-family:${SANS};font-size:13px;line-height:1.5;letter-spacing:0.02em;color:${C.soft};white-space:nowrap;">${esc(m[1])}</td><td valign="top" style="padding:7px 0;font-family:${SANS};font-size:15px;line-height:1.5;color:${C.ink};">${inline(m[2])}</td></tr>`;
      return `<tr><td colspan="2" style="padding:7px 0;font-family:${SANS};font-size:15px;line-height:1.5;color:${C.ink};">${inline(l)}</td></tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;background:${C.sand};border-radius:18px;"><tr><td style="padding:18px 22px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr></table>`;
}

/** Turns a plain-text template into the email's inner content. */
export function bodyHtml(body: string, key: string) {
  const blocks = body
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((b) => b.split("\n").map((l) => l.trim()).filter(Boolean))
    .filter((b) => b.length);
  const out: string[] = [];
  const label = BUTTON[key] ?? "Open";

  // The sign-off: the last block if it's short and ends with "Yalla" (or is a closing phrase).
  let signOff: string[] | null = null;
  const last = blocks[blocks.length - 1];
  if (last && last.length <= 2 && last.every((l) => SIGN_OFF.test(l) || l.length < 28) && /yalla$/i.test(last[last.length - 1])) signOff = blocks.pop()!;

  blocks.forEach((b, i) => {
    if (i === 0 && b.length === 1 && /^(hi|hello|dear)\b.*,$/i.test(b[0])) {
      out.push(`<p style="margin:0 0 18px;font-family:${SERIF};font-size:20px;line-height:1.4;color:${C.ink};">${esc(b[0])}</p>`);
      return;
    }
    const isDetails = b.every((l) => LABEL_LINE.test(l) || /^[•\-*]\s/.test(l)) && !b.some((l) => /:\s*https?:\/\//.test(l));
    if (isDetails && (b.length > 1 || /^[•\-*]\s/.test(b[0]))) {
      out.push(detailsCard(b));
      return;
    }
    // Paragraphs, with any bare link (or "Text: link") turned into a button.
    let para: string[] = [];
    const flush = () => {
      if (para.length) out.push(p(para.map(inline).join("<br>")));
      para = [];
    };
    for (const l of b) {
      if (URL_ONLY.test(l)) {
        flush();
        out.push(button(l, label));
        continue;
      }
      const tail = l.match(/^(.*?):\s*(https?:\/\/\S+)$/);
      if (tail) {
        para.push(`${tail[1]}.`.replace(/\.\.$/, "."));
        flush();
        out.push(button(tail[2], label));
        continue;
      }
      para.push(l);
    }
    flush();
  });

  if (signOff) {
    const [lead, name] = signOff.length === 2 ? signOff : [null, signOff[0]];
    out.push(
      `<p style="margin:8px 0 0;font-family:${SANS};font-size:16px;line-height:1.6;color:${C.ink};">${lead ? esc(lead) : "Warmly,"}</p>` +
        `<p style="margin:2px 0 0;font-family:${SERIF};font-style:italic;font-size:24px;line-height:1.3;color:${C.blue};">${esc(name)}</p>`,
    );
  }
  return out.join("\n");
}

/** The full designed email. */
export function emailHtml(input: { key: string; subject: string; body: string; audience: "family" | "billing" | "staff" }) {
  const base = assetBase();
  const staff = input.audience === "staff";
  const hero = !staff ? HERO[input.key] : undefined;
  const preheader = input.body
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
        site.instagram.value ? `<a href="${site.instagram.value}" style="color:${C.blue};text-decoration:none;">Instagram</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="${base}/portal" style="color:${C.blue};text-decoration:none;">Family Portal</a>` : "",
      ]
        .filter(Boolean)
        .join("<br>");

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
    ${hero ? `<img src="${base}/email/${hero}" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:28px 28px 0 0;">` : ""}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="px" style="padding:${hero ? "36px" : "44px"} 48px 40px;">
      <p style="margin:0 0 12px;font-family:${SANS};font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:${C.blue};">${staff ? "Yalla · Team" : "Yalla Childcare &amp; Coworking"}</p>
      <h1 class="h1" style="margin:0 0 26px;font-family:${SERIF};font-weight:400;font-size:32px;line-height:1.2;color:${C.ink};">${esc(input.subject)}</h1>
      ${bodyHtml(input.body, input.key)}
    </td></tr></table>
  </td></tr>
  <tr><td align="center" style="padding:28px 24px 0;font-family:${SANS};font-size:13px;line-height:1.8;color:${C.soft};">${footer}</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

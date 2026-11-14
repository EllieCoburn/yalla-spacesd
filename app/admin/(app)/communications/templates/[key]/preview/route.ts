import { requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { DEFAULT_TEMPLATES, render, SAMPLE_VARIABLES, TEMPLATE_VARIABLES, templateFor, type TemplateKey } from "@/lib/notify";
import { emailHtml } from "@/lib/notify/html";

/** The designed email for a template, filled with sample details, exactly as families will see it. */
export async function GET(_: Request, { params }: { params: Promise<{ key: string }> }) {
  await requirePermission("communications.view");
  const { key } = await params;
  if (!(key in DEFAULT_TEMPLATES)) return new Response("Not found", { status: 404 });
  const t = await templateFor(getDb(), key as TemplateKey);
  const samples: Record<string, string> = Object.fromEntries(TEMPLATE_VARIABLES[key as TemplateKey].map((v) => [v, SAMPLE_VARIABLES[v] ?? v]));
  if (key.endsWith("_received") || key === "staff_new_enquiry")
    Object.assign(samples, { name: key === "staff_new_enquiry" ? "Jordan Rivera" : "Jordan", kind: "tour request", kind_label: "Tour request" });
  const subject = render(t.subject, samples);
  const html = emailHtml({ key, subject, body: render(t.body, samples), audience: t.audience });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

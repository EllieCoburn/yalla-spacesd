"use server";

import { getDb } from "@/lib/db";
import { submitEnquiry } from "@/lib/ops/enquiries";
import { getGuardian, requestContext } from "../session";
import { allow } from "@/lib/rate-limit";

export type AskTeamState = { ok: true; email: string } | { ok: false; error: string } | null;

/**
 * A question the handbook couldn't answer, sent to Team Yalla. It's saved to Admin → Inbox (as a
 * "Handbook question"), emailed to the team, and the family gets a note that it arrived. Replies go
 * to the family's email.
 */
export async function askTeamYallaAction(input: { question: string; searched?: string; program?: string | null; section?: string | null }): Promise<AskTeamState> {
  const g = await getGuardian();
  if (!g) return { ok: false, error: "Please sign in to the Family Portal to send your question." };
  const question = String(input.question ?? "").trim().slice(0, 2000);
  if (question.length < 3) return { ok: false, error: "Please write your question first." };
  const { baseUrl, ip } = await requestContext();
  if (!(await allow(getDb(), "questionIp", ip ?? g.guardianId))) return { ok: false, error: "You’ve sent several questions recently. Please wait a little while, or email hello@yallaspacesd.com." };
  const details = [
    { label: "Question", value: question },
    ...(input.searched && input.searched.trim() !== question ? [{ label: "What they searched for", value: String(input.searched).slice(0, 300) }] : []),
    ...(input.program ? [{ label: "Reading the handbook for", value: String(input.program).slice(0, 60) }] : []),
    ...(input.section ? [{ label: "Handbook section they were reading", value: String(input.section).slice(0, 120) }] : []),
  ];
  try {
    await submitEnquiry(getDb(), {
      kind: "question",
      name: `${g.firstName} ${g.lastName}`.trim(),
      email: g.email,
      details,
      familyId: g.familyId,
      ip: ip ?? null,
      baseUrl,
    });
  } catch {
    return { ok: false, error: "Something went wrong sending your question. Please try again, or email hello@yallaspacesd.com." };
  }
  return { ok: true, email: g.email };
}

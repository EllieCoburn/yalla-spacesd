import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Handbook } from "@/components/handbook/Handbook";
import { isDbConfigured } from "@/lib/db";
import { PORTAL_OPEN_PREVIEW } from "@/lib/portal-preview";
import { getGuardian } from "../session";

export const metadata: Metadata = { title: "Family Handbook", robots: { index: false } };
export const dynamic = "force-dynamic";

/** The Yalla Family Handbook: explore by topic and program, or ask it a question. */
export default async function HandbookPage() {
  const g = isDbConfigured() ? await getGuardian() : null;
  if (!g && !PORTAL_OPEN_PREVIEW) redirect("/portal?signin=1&next=/portal/handbook");
  return <Handbook signedIn={!!g} firstName={g?.firstName ?? null} email={g?.email ?? null} />;
}

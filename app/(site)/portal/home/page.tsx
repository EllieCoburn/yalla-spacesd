import type { Metadata } from "next";
import { PortalDashboard } from "@/components/portal/PortalDashboard";

export const metadata: Metadata = { title: "Family Portal", robots: { index: false } };

export default function PortalHome() {
  return <PortalDashboard />;
}

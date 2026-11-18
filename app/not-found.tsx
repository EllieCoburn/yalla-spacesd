import type { Metadata } from "next";
import SiteLayout from "./(site)/layout";
import { MovedPage } from "@/components/site/MovedPage";

export const metadata: Metadata = { title: "Page moved" };

/** Any address that doesn't exist (e.g. an old Squarespace link) gets the site's header, a way forward, and the footer. */
export default function NotFound() {
  return (
    <SiteLayout>
      <MovedPage />
    </SiteLayout>
  );
}

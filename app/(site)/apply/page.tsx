import type { Metadata } from "next";
import { ApplicationForm } from "@/components/site/ApplicationForm";
import { PageHero } from "@/components/site/PageParts";

export const metadata: Metadata = {
  title: "Apply",
  description: "Apply for a Club Yalla membership. We’ll reach out when a space opens for your family.",
};

export default function ApplyPage() {
  return (
    <>
      <PageHero
        eyebrow="Apply · Club Yalla"
        mark="balcony"
        title={
          <>
            We’d love to <em>know your family.</em>
          </>
        }
        lede="Spaces in our cohorts open rarely, so every family begins with an application. When a space opens that fits your family, we’ll reach out personally and invite you to visit."
      />
      <section className="pb-24 lg:pb-32">
        <div className="shell">
          <div className="mx-auto max-w-3xl bg-paper p-7 sm:p-12">
            <ApplicationForm />
          </div>
        </div>
      </section>
    </>
  );
}

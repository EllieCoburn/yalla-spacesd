import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Mark } from "@/components/brand/Mark";
import { CodeForm, RequestAccessForm } from "@/components/prospective/AccessForms";
import { Eyebrow } from "@/components/ui/primitives";
import { hasProspectiveAccess } from "@/lib/prospective";

export const metadata: Metadata = {
  title: "Prospective Family Portal",
  description: "Current tuition, rates and enrollment details for families considering Yalla. Request access to enter.",
};

export default async function ProspectiveEntry() {
  if (await hasProspectiveAccess()) redirect("/prospective/home");

  return (
    <>
      <section className="pt-32 pb-16 lg:pt-44 lg:pb-24">
        <div className="shell grid gap-16 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <Eyebrow className="flex items-center gap-3">
              <Mark name="balcony" className="h-5 w-auto text-blue" />
              Prospective Family Portal
            </Eyebrow>
            <h1 className="display mt-7 text-[clamp(2.8rem,1.6rem+4vw,5.2rem)]">
              The details, <em>shared personally.</em>
            </h1>
            <p className="lede mt-8 max-w-xl text-ink-soft">
              Current tuition by cohort, drop-in rates, fees and workspace options live in our Prospective Family Portal. Reach out and we’ll
              send you an access code along with a personal note.
            </p>
          </div>

          <div className="lg:col-span-5 lg:col-start-8">
            <div className="border border-line bg-paper p-8 sm:p-10">
              <p className="display text-[1.7rem]">Have an access code?</p>
              <p className="mt-2 text-[0.92rem] text-ink-soft">Enter it below to open the portal.</p>
              <div className="mt-8">
                <CodeForm />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-paper py-20 lg:py-28">
        <div className="shell grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Eyebrow>Request access</Eyebrow>
            <h2 className="display mt-6 text-[clamp(2.1rem,1.5rem+2vw,3.2rem)]">
              Tell us a little <em>about your family.</em>
            </h2>
            <p className="mt-6 text-ink-soft">We’ll reply with current rates, your access code and an invitation to visit.</p>
          </div>
          <div className="bg-chalk p-7 sm:p-12 lg:col-span-7 lg:col-start-6">
            <RequestAccessForm />
          </div>
        </div>
      </section>
    </>
  );
}

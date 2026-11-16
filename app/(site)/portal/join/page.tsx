import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CreateAccountForm } from "@/components/portal/PortalForms";
import { getDb, isDbConfigured } from "@/lib/db";
import { inviteDetails } from "@/lib/family-auth";
import { getGuardian } from "../session";

export const metadata: Metadata = { title: "Join the Family Portal", robots: { index: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/**
 * The Family Portal is for Yalla families: anyone who books care on the website gets in as soon as
 * they pay, and anyone else joins by invitation from the Yalla team (e.g. after a tour).
 */
export default async function JoinPortal({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const sp = await searchParams;
  const configured = isDbConfigured();
  if (configured && (await getGuardian())) redirect("/portal/home");
  const invite = configured && sp.invite ? await inviteDetails(getDb(), sp.invite) : null;

  return (
    <section className="pt-32 pb-24 lg:pt-40">
      <div className="shell">
        <div className="mx-auto max-w-xl">
          <p className="eyebrow text-ink-soft">Family Portal</p>
          {invite ? (
            <>
              <h1 className="display mt-6 text-[clamp(2.6rem,2rem+2vw,3.6rem)]">
                Create your <em>family account.</em>
              </h1>
              <p className="mt-5 text-ink-soft">Welcome! Book Yalla experiences, manage your family’s details, and find your reservations, forms, payments and family resources in one place.</p>
              <CreateAccountForm invite={sp.invite!} email={invite.email} firstName={invite.firstName} lastName={invite.lastName} childrenRequired={!invite.hasChildren} />
            </>
          ) : (
            <>
              <h1 className="display mt-6 text-[clamp(2.6rem,2rem+2vw,3.6rem)]">
                Joining the <em>Family Portal.</em>
              </h1>
              {sp.invite ? (
                <p className="mt-5 rounded-2xl bg-sand/60 px-5 py-4 text-[0.95rem]">This invitation link has expired or was already used. Reply to your invitation email and we’ll gladly send a new one, or sign in below if you’ve already set up your account.</p>
              ) : null}
              <p className="mt-5 text-ink-soft">The Family Portal is home base for Yalla families. There are two ways in:</p>
              <ul className="mt-6 space-y-4">
                <li className="rounded-2xl border border-line p-5">
                  <p className="display text-[1.3rem]">Book care</p>
                  <p className="mt-1 text-[0.95rem] text-ink-soft">Book a Yalla Flex day or a Happening. Your Family Portal opens as soon as you check out, with your booking front and center.</p>
                  <Link href="/book" className="mt-3 inline-block text-[0.95rem] text-blue underline-offset-4 hover:underline">
                    Book care
                  </Link>
                </li>
                <li className="rounded-2xl border border-line p-5">
                  <p className="display text-[1.3rem]">Get an invitation</p>
                  <p className="mt-1 text-[0.95rem] text-ink-soft">Exploring Yalla for later? Book a tour or send us a note, and our team will email you an invitation when the time is right.</p>
                  <Link href="/book-a-tour" className="mt-3 inline-block text-[0.95rem] text-blue underline-offset-4 hover:underline">
                    Book a tour
                  </Link>
                </li>
              </ul>
            </>
          )}
          <p className="mt-10 text-[0.95rem] text-ink-soft">
            Already have an account?{" "}
            <Link href="/portal" className="text-ink underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}

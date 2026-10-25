import type { Metadata } from "next";
import { ForgotForm } from "../AuthForms";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPage() {
  return (
    <>
      <h1 className="mt-8 font-serif text-[2rem] text-ink lg:mt-0">Reset your password</h1>
      <p className="mt-2 mb-8 text-[0.9rem] text-ink-soft">We’ll email a link that works for one hour.</p>
      <ForgotForm />
    </>
  );
}

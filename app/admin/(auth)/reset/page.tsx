import type { Metadata } from "next";
import Link from "next/link";
import { ResetForm } from "../AuthForms";

export const metadata: Metadata = { title: "Choose a password" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string; invite?: string }> }) {
  const { token, invite } = await searchParams;
  return (
    <>
      <h1 className="mt-8 font-serif text-[2rem] text-ink lg:mt-0">{invite ? "Welcome to Yalla Admin" : "Choose a new password"}</h1>
      <p className="mt-2 mb-8 text-[0.9rem] text-ink-soft">Signing in again will be required on every device.</p>
      {token ? (
        <ResetForm token={token} invite={!!invite} />
      ) : (
        <p className="text-[0.9rem]">
          This link is incomplete.{" "}
          <Link className="text-blue underline" href="/admin/forgot">
            Request a new one
          </Link>
          .
        </p>
      )}
    </>
  );
}

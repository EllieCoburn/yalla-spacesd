import type { Metadata } from "next";
import { Mark } from "@/components/brand/Mark";
import { isDbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Yalla Admin", template: "%s · Yalla Admin" },
  robots: { index: false, follow: false },
};

export default function AdminRoot({ children }: { children: React.ReactNode }) {
  if (!isDbConfigured()) {
    return (
      <main id="main" className="flex min-h-screen items-center justify-center bg-chalk p-6">
        <div className="max-w-lg rounded-2xl border border-ink/10 bg-white p-8">
          <Mark name="wordmark" className="h-8 w-auto text-blue" />
          <h1 className="mt-6 font-serif text-2xl text-ink">The admin portal needs a database</h1>
          <p className="mt-3 text-[0.92rem] text-ink-soft">
            Set <code className="rounded bg-ink/5 px-1">DATABASE_URL</code> for this deployment (for example by adding Neon Postgres from the Vercel Marketplace), redeploy so
            migrations run, then create the first administrator. Step-by-step instructions are in <code className="rounded bg-ink/5 px-1">docs/ADMIN.md</code>.
          </p>
        </div>
      </main>
    );
  }
  return <div className="min-h-screen bg-[#f4f2ec] text-ink">{children}</div>;
}

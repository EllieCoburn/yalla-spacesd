import { Mark } from "@/components/brand/Mark";
import { WindowField } from "@/components/brand/WindowField";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="relative hidden overflow-hidden lg:block">
        <WindowField seed={9} width={900} height={1200} className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-chalk px-12 py-14 text-center">
            <Mark name="mark" className="mx-auto h-32 w-auto text-blue" />
            <p className="mt-6 text-[0.72rem] font-medium tracking-[0.24em] text-ink-soft uppercase">Yalla Admin</p>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center bg-chalk px-6 py-12">
        <div className="w-full max-w-sm">
          <Mark name="wordmark" className="h-8 w-auto text-blue lg:hidden" />
          {children}
        </div>
      </div>
    </main>
  );
}

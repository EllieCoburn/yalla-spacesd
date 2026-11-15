import { AnnouncementBar, showAnnouncement } from "@/components/site/AnnouncementBar";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const banner = showAnnouncement();
  return (
    <>
      <AnnouncementBar />
      <SiteHeader offset={banner} />
      <main id="main" className={banner ? "pt-10" : undefined}>
        {children}
      </main>
      <SiteFooter />
    </>
  );
}

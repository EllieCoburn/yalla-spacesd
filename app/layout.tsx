import type { Metadata, Viewport } from "next";
import { SiteAnalytics } from "@/components/site/SiteAnalytics";
import { DM_Sans } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

// Bebas Neue everywhere: the light 2010 Dharma Type "Bebas Neue Regular" for text (weight 400) and the
// 2019 Bebas Neue for headings and anything bold (weight 700). Both SIL Open Font License, web use allowed.
const bebas = localFont({
  src: [
    { path: "./fonts/BebasNeue-Regular-Light.woff2", weight: "400", style: "normal" },
    { path: "./fonts/BebasNeue-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-bebas",
  display: "swap",
  // While it loads, show DM Sans rather than a metric-matched Arial.
  adjustFontFallback: false,
  // All capitals and narrow, so a touch larger than a normal text face to read comfortably.
  declarations: [{ prop: "size-adjust", value: "112%" }],
});
// DM Sans only stands behind Bebas for the few characters it doesn't draw (the → and ← arrows).
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://www.yallaspacesd.com"),
  title: {
    default: "Yalla Coworking & Childcare · San Diego",
    template: "%s · Yalla",
  },
  description:
    "Yalla is a community for children and their grown-ups, offering thoughtfully designed childcare, coworking, and experiences for family life in San Diego.",
  icons: { icon: "/brand/mark.svg" },
  // Pinterest "Claim your website" verification for Yalla's Pinterest business account.
  other: { "p:domain_verify": "99c4f6b64b0bb2e7ad58425f39d126a1" },
};

export const viewport: Viewport = {
  themeColor: "#f7f5ef",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bebas.variable} ${dmSans.variable}`}>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[70] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-chalk">
          Skip to content
        </a>
        {children}
        {/* Vercel Web Analytics and Speed Insights, public pages only (no admin, portal or private links). */}
        <SiteAnalytics />
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { SiteAnalytics } from "@/components/site/SiteAnalytics";
import { DM_Sans, Lora } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const lora = Lora({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-lora", display: "swap" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });
// Palmer Lake Print (Jen Wagner Co., web license purchased by Yalla): the body and copy font across the site.
// It has one weight and no arrows, so DM Sans stays behind it for anything it doesn't draw.
const palmerLake = localFont({
  src: "./fonts/PalmerLakePrint-Regular.woff2",
  weight: "400",
  style: "normal",
  variable: "--font-palmer",
  display: "swap",
  // While it loads, show DM Sans (already on the page) rather than a metric-matched Arial.
  adjustFontFallback: false,
  // Its letters are drawn small for their size (cap height 0.54 em vs DM Sans's 0.7), so scale it up to read at normal text size.
  declarations: [{ prop: "size-adjust", value: "175%" }],
});

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
    <html lang="en" className={`${lora.variable} ${dmSans.variable} ${palmerLake.variable}`}>
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

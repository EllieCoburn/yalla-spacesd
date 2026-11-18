import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";
const preview = process.env.VERCEL_ENV === "preview";

/**
 * Content Security Policy. Scripts and styles come only from this site (Next.js needs inline
 * bootstrap scripts, hence 'unsafe-inline'); the only embedded third party is the Google Maps
 * frame on Book a tour. Nothing may frame Yalla's pages. Card payments happen on Stripe's own
 * hosted page, reached by redirect.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}${preview ? " https://vercel.live" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${preview ? " https://vercel.live wss://ws-us3.pusher.com" : ""}`,
  `frame-src https://www.google.com${preview ? " https://vercel.live" : ""}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Invoice PDFs read Yalla's fonts and logo from disk at runtime.
  outputFileTracingIncludes: { "/portal/invoices/[id]/pdf": ["./lib/billing/assets/**"] },
  images: { formats: ["image/avif", "image/webp"] },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Pages opened from emailed sign-in and reset links: never send the address (and its key) onward.
      { source: "/portal/verify", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/admin/reset", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/book/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/pay/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/play-passes/welcome", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/portal/join", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
  // Pricing is now public on the Membership page; old portal links land there.
  async redirects() {
    return [
      { source: "/prospective", destination: "/membership", permanent: false },
      { source: "/prospective/:path*", destination: "/membership", permanent: false },
      { source: "/programs/club-yalla", destination: "/club-yalla", permanent: true },
      // Yalla Weekends is now Weekend Play Sessions, part of Yalla Happenings.
      { source: "/programs/yalla-weekends", destination: "/programs/yalla-happenings#weekend-play", permanent: false },
      // Yalla After Hours is now After Hours Evenings, part of Yalla Happenings.
      { source: "/programs/yalla-after-hours", destination: "/programs/yalla-happenings#after-hours", permanent: false },
      // Yalla Celebrations is paused for now.
      { source: "/programs/yalla-celebrations", destination: "/programs/yalla-happenings", permanent: false },
      // The parking guide is public now (it was only in the Family Portal).
      { source: "/portal/parking", destination: "/parking", permanent: false },
      // The Visit page is now Book a tour.
      { source: "/visit", destination: "/book-a-tour", permanent: false },
      // The Spaces page now lives on the About page.
      { source: "/spaces", destination: "/about#our-space", permanent: false },
    ];
  },
};

export default nextConfig;

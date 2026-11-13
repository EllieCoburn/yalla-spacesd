import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { formats: ["image/avif", "image/webp"] },
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
      // The Visit page is now Book a tour.
      { source: "/visit", destination: "/book-a-tour", permanent: false },
      // The Spaces page now lives on the About page.
      { source: "/spaces", destination: "/about#our-space", permanent: false },
    ];
  },
};

export default nextConfig;

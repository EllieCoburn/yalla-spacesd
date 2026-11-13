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
      // The Spaces page now lives on the About page.
      { source: "/spaces", destination: "/about#our-space", permanent: false },
    ];
  },
};

export default nextConfig;

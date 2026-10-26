import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { formats: ["image/avif", "image/webp"] },
  // Pricing is now public on the Membership page; old portal links land there.
  async redirects() {
    return [
      { source: "/prospective", destination: "/membership", permanent: false },
      { source: "/prospective/:path*", destination: "/membership", permanent: false },
    ];
  },
};

export default nextConfig;

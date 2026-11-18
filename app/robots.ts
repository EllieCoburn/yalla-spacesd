import type { MetadataRoute } from "next";
import { SITE_URL } from "./sitemap";

/** Search engines may list the public site; private and transactional pages stay out. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/portal", "/api", "/pay", "/book/confirmation", "/book/offer", "/coupon", "/play-passes/welcome"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

import type { MetadataRoute } from "next";
import { programs } from "@/content/programs";

/** Yalla's public address, as Google should list it. */
export const SITE_URL = "https://www.yallaspacesd.com";

/** Every public page, so Google finds the current site (and drops the old Squarespace pages). */
export default function sitemap(): MetadataRoute.Sitemap {
  const pages: { path: string; priority: number }[] = [
    { path: "/", priority: 1 },
    { path: "/club-yalla", priority: 0.9 },
    { path: "/programs", priority: 0.9 },
    ...programs.filter((p) => p.kind !== "membership").map((p) => ({ path: `/programs/${p.slug}`, priority: 0.8 })),
    { path: "/coworking", priority: 0.8 },
    { path: "/membership", priority: 0.7 },
    { path: "/play-passes", priority: 0.7 },
    { path: "/book", priority: 0.7 },
    { path: "/book-a-tour", priority: 0.7 },
    { path: "/apply", priority: 0.7 },
    { path: "/experience", priority: 0.6 },
    { path: "/approach", priority: 0.6 },
    { path: "/about", priority: 0.6 },
    { path: "/about/team", priority: 0.5 },
    { path: "/belonging", priority: 0.5 },
    { path: "/faq", priority: 0.5 },
    { path: "/policies", priority: 0.4 },
    { path: "/parking", priority: 0.3 },
  ];
  const now = new Date();
  return pages.map((p) => ({ url: `${SITE_URL}${p.path === "/" ? "" : p.path}`, lastModified: now, changeFrequency: "weekly", priority: p.priority }));
}

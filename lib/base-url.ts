/**
 * The site address used in emailed and redirect links. It never comes from the incoming request on
 * Vercel (a forged Host or X-Forwarded-Host header must not be able to point a sign-in or reset link
 * at another site). Order: PUBLIC_BASE_URL, then Vercel's own system address for the deployment.
 * Only local development off Vercel falls back to the request's host.
 */
export function trustedBaseUrl(requestHost?: string | null): string {
  const pub = process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  if (pub) return pub;
  if (process.env.VERCEL) {
    const sys = process.env.VERCEL_ENV === "production" ? process.env.VERCEL_PROJECT_PRODUCTION_URL : process.env.VERCEL_URL;
    if (sys) return `https://${sys.replace(/\/+$/, "")}`;
    throw new Error("PUBLIC_BASE_URL is not set, so links can't be built safely.");
  }
  const host = requestHost || "localhost:3000";
  const local = host.startsWith("localhost") || host.startsWith("127.");
  return `${local ? "http" : "https"}://${host}`;
}

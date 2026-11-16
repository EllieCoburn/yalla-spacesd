/**
 * The built-in test checkout lets anyone "pay" without money moving, so it must never be reachable
 * by accident. On any Vercel deployment (production and previews, which may share data) it needs
 * ALLOW_TEST_PAYMENTS=true; it's on by default only for local development.
 */
export function testPaymentsAllowed() {
  if (process.env.VERCEL) return process.env.ALLOW_TEST_PAYMENTS === "true";
  return true;
}

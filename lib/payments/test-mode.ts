/**
 * The built-in test checkout lets anyone "pay" without money moving, so it must never be
 * reachable on the live site by accident. It's allowed in development and on Vercel preview
 * deployments; on production it requires ALLOW_TEST_PAYMENTS=true.
 */
export function testPaymentsAllowed() {
  if (process.env.VERCEL_ENV === "production") return process.env.ALLOW_TEST_PAYMENTS === "true";
  return true;
}

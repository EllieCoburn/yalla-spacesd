/** A coupon code from an email link, kept in the browser until it's used at checkout. */
const KEY = "yalla.coupon.v1";

export function saveCoupon(code: string) {
  try {
    const c = code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 30);
    if (c) localStorage.setItem(KEY, c);
  } catch {}
}

export function savedCoupon(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearSavedCoupon() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

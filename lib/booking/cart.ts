/**
 * The booking cart: whatever a family has added (sessions, how many spots, day length and extras)
 * is kept on their device, so they can read the FAQ or another page and pick up where they left off
 * from the cart button in the header. Only the choice of sessions is kept here: children's details,
 * contact details and agreements are never stored in the browser.
 */
export type CartItem = {
  /** Session id. */
  id: string;
  /** Its date (yyyy-mm-dd), so past days drop out. */
  date: string;
  /** What it is, for the cart button ("Yalla Flex · 3 – 4 years"). */
  label: string;
  spots: number;
  extras: string[];
  /** One of several age groups of a Happening chosen together (matched to children by age). */
  flexible?: boolean;
};

const KEY = "yalla.cart.v1";
const EVENT = "yalla:cart";
/** A cart left alone this long is cleared. */
const TTL_MS = 7 * 24 * 3600_000;

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

export function readCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as { items?: CartItem[]; savedAt?: number } | null;
    if (!raw?.items || !raw.savedAt || Date.now() - raw.savedAt > TTL_MS) return [];
    const t = today();
    return raw.items.filter((i) => i && typeof i.id === "string" && typeof i.date === "string" && i.date >= t).slice(0, 60);
  } catch {
    return [];
  }
}

export function writeCart(items: CartItem[]) {
  if (typeof window === "undefined") return;
  try {
    if (items.length) window.localStorage.setItem(KEY, JSON.stringify({ items: items.slice(0, 60), savedAt: Date.now() }));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* Private browsing or storage turned off: the cart just isn't kept. */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Adds (or updates) items, keeping everything else already in the cart. */
export function addToCart(items: CartItem[]) {
  const ids = new Set(items.map((i) => i.id));
  writeCart([...readCart().filter((i) => !ids.has(i.id)), ...items]);
}

/** Takes items out (e.g. once they're booked and paid). */
export function removeFromCart(ids: string[]) {
  const drop = new Set(ids);
  writeCart(readCart().filter((i) => !drop.has(i.id)));
}

export function clearCart() {
  writeCart([]);
}

/** Calls `fn` whenever the cart changes (in this tab or another). */
export function onCartChange(fn: () => void) {
  const storage = (e: StorageEvent) => e.key === KEY && fn();
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", storage);
  };
}

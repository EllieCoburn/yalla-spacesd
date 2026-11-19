/**
 * The booking cart: whatever a family has added (sessions, how many spots, day length and extras)
 * is kept on their device, so they can read the FAQ or another page and pick up where they left off
 * from the cart button in the header. Only the choice of sessions is kept here: children's details,
 * contact details and agreements are never stored in the browser.
 *
 * A copy of the same selection (session ids, spots and extras, under a random cart id) is sent to
 * Yalla so staff can see what's in carts (Admin → Carts & checkouts). It's anonymous unless the
 * visitor is signed in to the Family Portal.
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
const ID_KEY = "yalla.cart.id";
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
  syncCart();
}

function cartId(): string | null {
  try {
    let id = window.localStorage.getItem(ID_KEY);
    if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
      id = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "");
      window.localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

let syncTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Sends Yalla a copy of the cart shortly after it changes (several quick changes send once). Also
 * called when a page opens with something in the cart, so a family who signs in is linked to it.
 */
export function syncCart(delayMs = 1200) {
  if (typeof window === "undefined") return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    const id = cartId();
    if (!id) return;
    const items = readCart().map(({ id: sessionId, spots, extras, flexible }) => ({ id: sessionId, spots, extras, flexible }));
    fetch("/api/cart", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cartId: id, items }), keepalive: true }).catch(() => {});
  }, delayMs);
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

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { onCartChange, readCart, removeFromCart, type CartItem } from "@/lib/booking/cart";

/**
 * The cart in the site header: shows how much a family has added, on every page, and takes them
 * straight back into checkout. Hidden on the booking page, where the selection is already shown.
 */
export function CartButton({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const [items, setItems] = useState<CartItem[]>([]);
  useEffect(() => {
    const update = () => setItems(readCart());
    update();
    return onCartChange(update);
  }, [pathname]);
  if (!items.length || pathname === "/book" || pathname.startsWith("/book/")) return null;
  const n = items.length;
  const first = items[0];
  return (
    <Link
      href="/book?cart=1"
      title={n === 1 ? first.label : `${first.label} and ${n - 1} more`}
      className={`inline-flex h-10 items-center gap-2 rounded-full bg-blue pr-4 pl-3.5 text-[0.82rem] tracking-[0.02em] text-chalk shadow-[0_6px_18px_-8px_rgba(96,101,242,0.7)] transition-colors duration-500 hover:bg-blue-deep ${className}`}
    >
      <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 8h14l-1.2 11.1a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9L5 8Z" />
        <path d="M9 10V7a3 3 0 0 1 6 0v3" />
      </svg>
      <span>
        <span className="sr-only">Continue booking: </span>
        Cart · {n}
      </span>
    </Link>
  );
}

/** On the confirmation page: what was just booked comes out of the cart. */
export function CartBooked({ sessionIds }: { sessionIds: string[] }) {
  useEffect(() => removeFromCart(sessionIds), [sessionIds]);
  return null;
}

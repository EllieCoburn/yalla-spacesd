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
      className={`relative inline-flex h-11 w-11 items-center justify-center text-ink transition-colors duration-500 hover:text-blue ${className}`}
    >
      <span className="sr-only">Continue booking: {n} in your cart</span>
      <svg viewBox="0 0 24 24" aria-hidden className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 3.5h2.2l2.3 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1l1.6-6.3H6" />
        <circle cx="9.5" cy="19.5" r="1.3" />
        <circle cx="16.5" cy="19.5" r="1.3" />
      </svg>
      <span aria-hidden className="absolute top-1 right-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-blue px-1 text-[0.66rem] leading-none font-medium text-chalk">
        {n}
      </span>
    </Link>
  );
}

/** On the confirmation page: what was just booked comes out of the cart. */
export function CartBooked({ sessionIds }: { sessionIds: string[] }) {
  useEffect(() => removeFromCart(sessionIds), [sessionIds]);
  return null;
}

"use client";

import { useEffect } from "react";
import { saveCoupon } from "@/lib/booking/saved-coupon";

/** A link with ?coupon=CODE (from an email) saves the code so checkout applies it automatically. */
export function CouponFromLink() {
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("coupon");
    if (code) saveCoupon(code);
  }, []);
  return null;
}

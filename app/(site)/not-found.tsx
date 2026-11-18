import type { Metadata } from "next";
import { MovedPage } from "@/components/site/MovedPage";

export const metadata: Metadata = { title: "Page moved" };

export default function NotFound() {
  return <MovedPage />;
}

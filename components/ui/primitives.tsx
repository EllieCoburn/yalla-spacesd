import Image from "next/image";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type ButtonProps = ComponentProps<typeof Link> & {
  variant?: "solid" | "outline" | "ghost" | "light";
  size?: "md" | "lg";
};

export function Button({ variant = "solid", size = "md", className = "", children, ...rest }: ButtonProps) {
  const base =
    "group inline-flex items-center justify-center gap-3 rounded-full font-sans tracking-[0.04em] transition-all duration-500 ease-[var(--ease-soft)] whitespace-nowrap";
  const sizes = { md: "h-11 px-6 text-[0.875rem]", lg: "h-14 px-8 text-[0.95rem]" };
  const variants = {
    solid: "bg-ink text-chalk hover:bg-blue",
    outline: "border border-ink/25 text-ink hover:border-ink hover:bg-ink hover:text-chalk",
    ghost: "px-0! text-ink hover:text-blue",
    light: "bg-chalk text-ink hover:bg-mist",
  };
  return (
    <Link className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest}>
      {children}
      <Arrow className="h-3 w-5 transition-transform duration-500 ease-[var(--ease-soft)] group-hover:translate-x-1" />
    </Link>
  );
}

export function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 12" className={className} fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
      <path d="M0 6h18.5M13.5 1l5 5-5 5" />
    </svg>
  );
}

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`eyebrow text-ink-soft ${className}`}>{children}</p>;
}

/** Numbered section label — "01 — The day" */
export function Index({ n, children, className = "" }: { n: string; children: ReactNode; className?: string }) {
  return (
    <p className={`eyebrow flex items-center gap-4 text-ink-soft ${className}`}>
      <span className="font-serif text-[0.85rem] tracking-normal text-blue normal-case italic">{n}</span>
      <span className="h-px w-8 bg-current opacity-40" />
      {children}
    </p>
  );
}

type PhotoProps = {
  src: string;
  alt: string;
  shape?: "arch" | "circle" | "rect" | "soft";
  className?: string;
  sizes?: string;
  priority?: boolean;
  caption?: string;
};

/** Photography frames drawn from the building: the arched doorway, the round porthole window. */
export function Photo({ src, alt, shape = "arch", className = "", sizes = "(min-width: 1024px) 40vw, 90vw", priority, caption }: PhotoProps) {
  const shapes = {
    arch: "rounded-t-[999px]",
    circle: "rounded-full aspect-square",
    rect: "",
    soft: "rounded-[2px]",
  };
  return (
    <figure className={`relative ${className}`}>
      <div className={`relative h-full w-full overflow-hidden bg-sand ${shapes[shape]}`}>
        <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="object-cover transition-transform duration-[1.6s] ease-[var(--ease-soft)] hover:scale-[1.03]" />
      </div>
      {caption ? <figcaption className="eyebrow mt-4 text-ink-soft">{caption}</figcaption> : null}
    </figure>
  );
}

import type { ReactNode } from "react";

/**
 * Hand-drawn motifs that extend the Yalla mark set: chunky, round-ended shapes with a slight
 * ink wobble, drawn to sit beside the vectorized logo marks. They render in currentColor.
 */
export const motifs = {
  /** Dotted sun: a ring with ten rounded rays. */
  dotsun: {
    viewBox: "2 2 196 196",
    node: (
      <>
        <circle cx="100" cy="100" r="35" fill="none" stroke="currentColor" strokeWidth="22" />
        {[0, 36, 72, 108, 144, 180, 216, 252, 288, 324].map((a, i) => (
          <ellipse key={a} cx="100" cy="24" rx={i % 2 ? 9 : 10} ry={i % 2 ? 13.5 : 15} transform={`rotate(${a} 100 100)`} />
        ))}
      </>
    ),
  },
  /** Crescent moon with two sparkles. */
  moon: {
    viewBox: "26 38 158 134",
    node: (
      <>
        <path d="M 95.4 46.1 A 60 60 0 1 0 146.9 130.3 A 50 50 0 0 1 95.4 46.1 Z" />
        <path d="M 154 128 Q 156 142 170 144 Q 156 146 154 160 Q 152 146 138 144 Q 152 142 154 128 Z" />
        <path d="M 168 88 Q 169 97 178 98 Q 169 99 168 108 Q 167 99 158 98 Q 167 97 168 88 Z" />
      </>
    ),
  },
  /** A leafy sprig. */
  sprig: {
    viewBox: "56 8 90 178",
    node: (
      <>
        <path d="M 100 176 C 97 140 104 100 100 36" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" />
        <ellipse cx="80" cy="132" rx="11" ry="23" transform="rotate(-42 80 132)" />
        <ellipse cx="121" cy="110" rx="11" ry="23" transform="rotate(42 121 110)" />
        <ellipse cx="82" cy="86" rx="10" ry="21" transform="rotate(-42 82 86)" />
        <ellipse cx="118" cy="64" rx="10" ry="19" transform="rotate(42 118 64)" />
        <ellipse cx="100" cy="30" rx="9" ry="15" />
      </>
    ),
  },
  /** Three wavy lines. */
  waves: {
    viewBox: "18 42 164 108",
    node: (
      <g fill="none" stroke="currentColor" strokeWidth="14" strokeLinecap="round">
        <path d="M 30 68 q 17.5 -18 35 0 t 35 0 t 35 0 t 35 0" />
        <path d="M 30 104 q 17.5 -18 35 0 t 35 0 t 35 0 t 35 0" />
        <path d="M 30 140 q 17.5 -18 35 0 t 35 0 t 35 0 t 35 0" />
      </g>
    ),
  },
} satisfies Record<string, { viewBox: string; node: ReactNode }>;

export type MotifName = keyof typeof motifs;

export const isMotif = (name: string): name is MotifName => name in motifs;

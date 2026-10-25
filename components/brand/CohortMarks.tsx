/**
 * Cohort illustrations, drawn in the same chunky, hand-inked language as the
 * Yalla logo: round-capped strokes, filled frond-like leaves, a wobbly ground line.
 * Seedling → Sapling → Sprout → Wildflower.
 */

type Props = { className?: string; title?: string };

/** Slight displacement so edges read as brush-inked, like the logo. */
const Ink = ({ id, seed }: { id: string; seed: number }) => (
  <defs>
    <filter id={id} x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed={seed} />
      <feDisplacementMap in="SourceGraphic" scale="2.4" />
    </filter>
  </defs>
);

/** A leaf vein, cut out of the filled leaf in the card's ground color. */
const Vein = ({ d }: { d: string }) => <path d={d} stroke="var(--color-mist)" strokeWidth="2.2" />;

const Svg = ({ className, title, children, ink }: Props & { children: React.ReactNode; ink: [string, number] }) => (
  <svg
    viewBox="0 0 120 120"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="6"
    strokeLinecap="round"
    strokeLinejoin="round"
    role={title ? "img" : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
  >
    <Ink id={ink[0]} seed={ink[1]} />
    <g filter={`url(#${ink[0]})`}>{children}</g>
  </svg>
);

const Ground = () => <path d="M14 103c14-2.5 30 1.5 46-.5s32-2.5 46 .8" />;

export function SeedlingMark(props: Props) {
  return (
    <Svg {...props} ink={["ink-seedling", 3]}>
      <Ground />
      {/* seed, half-buried */}
      <path d="M46 102c-1-8 6-14 14.5-14S76 94 74.5 102" fill="currentColor" />
      {/* first shoot */}
      <path d="M60 89c-.5-9 1-16 5-22" />
      {/* unfurling leaf */}
      <path d="M65 67c4-9 14-12 22-10-2 9-12 15-22 10Z" fill="currentColor" />
      <path d="M62.5 74c-5-5-12-6-17-4 2 6 9 8 17 4Z" fill="currentColor" />
      <Vein d="M68 65c5-3 10-5 15-6" />
      {/* soil specks */}
      <circle cx="36" cy="110" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="84" cy="111" r="1.6" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function SaplingMark(props: Props) {
  return (
    <Svg {...props} ink={["ink-sapling", 7]}>
      <Ground />
      {/* trunk */}
      <path d="M60 102c.8-14-1.5-26 .5-40 1-8 0-16 .5-24" />
      {/* branches */}
      <path d="M60.5 70c6-4 12-6 18-11" />
      <path d="M60 58c-5-3-10-6-15-11" />
      {/* leaves */}
      <path d="M61 38c-7-6-8-18-1-27 7 8 8 20 1 27Z" fill="currentColor" />
      <path d="M78.5 59c3-8 11-12 19-11-2 8-10 13-19 11Z" fill="currentColor" />
      <path d="M45 47c-3-8-11-11-18-10 2 8 10 12 18 10Z" fill="currentColor" />
      <Vein d="M60.5 33c0-6 0-12-.5-17" />
      <Vein d="M82 56c4-2 8-4 12-5" />
      <Vein d="M42 45c-3-2-7-4-11-5" />
      {/* buds */}
      <circle cx="71" cy="45" r="3.4" fill="currentColor" stroke="none" />
      <circle cx="50" cy="66" r="3.2" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function SproutMark(props: Props) {
  return (
    <Svg {...props} ink={["ink-sprout", 11]}>
      <Ground />
      {/* little mound */}
      <path d="M44 102c4-5 10-7 16-7s12 2 16 7" />
      {/* stem */}
      <path d="M60 95c-1-12 1-24-.5-36" />
      {/* two big leaves, like palm fronds */}
      <path d="M59.5 66c-9-12-24-14-34-9 7 12 22 16 34 9Z" fill="currentColor" />
      <path d="M59.5 59c8-14 24-18 35-13-6 13-22 19-35 13Z" fill="currentColor" />
      <Vein d="M55 63c-8-4-16-5-24-4" />
      <Vein d="M64 56c8-5 17-7 26-8" />
      {/* curl */}
      <path d="M59.5 59c0-6 2-10 6-12" />
    </Svg>
  );
}

export function WildflowerMark(props: Props) {
  const petals = [0, 72, 144, 216, 288];
  return (
    <Svg {...props} ink={["ink-wildflower", 5]}>
      <Ground />
      {/* stems */}
      <path d="M54 102c-2-14 2-28-1-44" />
      <path d="M57 102c4-10 10-18 17-24" />
      {/* leaf */}
      <path d="M54.5 84c-8-6-18-6-23-2 6 7 16 8 23 2Z" fill="currentColor" />
      {/* main flower: looped petals like the brand's drawn flower */}
      <g transform="translate(53 40)">
        {petals.map((r) => (
          <ellipse key={r} cx="0" cy="-11" rx="6.2" ry="10" transform={`rotate(${r})`} />
        ))}
        <circle r="4.5" fill="currentColor" stroke="none" />
      </g>
      {/* small bloom */}
      <g transform="translate(78 72)">
        {[0, 120, 240].map((r) => (
          <ellipse key={r} cx="0" cy="-6" rx="3.6" ry="5.6" transform={`rotate(${r})`} strokeWidth="4.5" />
        ))}
        <circle r="2.4" fill="currentColor" stroke="none" />
      </g>
    </Svg>
  );
}

export const cohortMarks = {
  Seedlings: SeedlingMark,
  Saplings: SaplingMark,
  Sprouts: SproutMark,
  Wildflowers: WildflowerMark,
} as const;

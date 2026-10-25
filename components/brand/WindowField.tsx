/**
 * "Structure, softened" — the building's window grid, redrawn as loose,
 * hand-cut panes. Deterministic so it renders identically on server and client.
 */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Props = {
  seed?: number;
  width?: number;
  height?: number;
  className?: string;
  /** Pane color and ground color as CSS colors. */
  pane?: string;
  ground?: string;
  /** Adds the long hand-drawn horizon line from the logo. */
  horizon?: boolean;
};

export function WindowField({
  seed = 7,
  width = 1200,
  height = 360,
  className = "",
  pane = "var(--color-blue)",
  ground = "var(--color-mist)",
  horizon = true,
}: Props) {
  const r = rng(seed);
  const shapes: string[] = [];
  const gap = 14;
  let y = gap;

  while (y < height - 40) {
    const rowH = 54 + Math.floor(r() * 90);
    let x = gap - Math.floor(r() * 60);
    while (x < width) {
      const w = 40 + Math.floor(r() * 150);
      const skip = r() < 0.12;
      if (!skip) {
        const j = () => (r() - 0.5) * 5;
        const x0 = x + j(),
          y0 = y + j(),
          x1 = x + w + j(),
          y1 = y + j(),
          x2 = x + w + j(),
          y2 = Math.min(y + rowH, height - gap) + j(),
          x3 = x + j(),
          y3 = Math.min(y + rowH, height - gap) + j();
        if (r() < 0.14 && w > 70 && rowH > 90) {
          // An arched pane, like the doorway.
          const rad = (x1 - x0) / 2;
          shapes.push(`M${x3} ${y3}L${x0} ${y0 + rad}A${rad} ${rad} 0 0 1 ${x1} ${y1 + rad}L${x2} ${y2}Z`);
        } else {
          shapes.push(`M${x0} ${y0}L${x1} ${y1}L${x2} ${y2}L${x3} ${y3}Z`);
        }
      }
      x += w + gap + Math.floor(r() * 10);
    }
    y += rowH + gap + Math.floor(r() * 8);
  }

  const hy = height * (0.45 + r() * 0.2);
  const horizonPath = `M-10 ${hy + 6} C ${width * 0.25} ${hy - 4}, ${width * 0.55} ${hy + 10}, ${width + 10} ${hy - 6}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <rect width={width} height={height} fill={ground} />
      <g fill={pane} stroke={pane} strokeWidth="5" strokeLinejoin="round">
        {shapes.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      {horizon ? <path d={horizonPath} fill="none" stroke={ground} strokeWidth="9" strokeLinecap="round" /> : null}
    </svg>
  );
}

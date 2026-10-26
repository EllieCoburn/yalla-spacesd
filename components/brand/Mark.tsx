import { marks, type MarkName } from "./marks";
import { isMotif, motifs } from "./motifs";

type Props = {
  name: MarkName;
  className?: string;
  title?: string;
};

/** A piece of the hand-drawn Yalla logo, or one of its motifs, rendered in currentColor. */
export function Mark({ name, className, title }: Props) {
  const motif = isMotif(name) ? motifs[name] : null;
  return (
    <svg
      viewBox={motif ? motif.viewBox : marks[name as keyof typeof marks].viewBox}
      className={className}
      fill="currentColor"
      fillRule="evenodd"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {motif ? (
        <>
          {/* A slight displacement so the motif's edges read as brush-inked, like the logo. */}
          <defs>
            <filter id={`ink-${name}`} x="-10%" y="-10%" width="120%" height="120%">
              <feTurbulence type="fractalNoise" baseFrequency="0.028" numOctaves="2" seed="7" />
              <feDisplacementMap in="SourceGraphic" scale="6" />
            </filter>
          </defs>
          <g filter={`url(#ink-${name})`}>{motif.node}</g>
        </>
      ) : (
        <path d={marks[name as keyof typeof marks].d} />
      )}
    </svg>
  );
}

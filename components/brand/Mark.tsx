import { marks, type MarkName } from "./marks";

type Props = {
  name: MarkName;
  className?: string;
  title?: string;
};

/** A piece of the hand-drawn Yalla logo, rendered in currentColor. */
export function Mark({ name, className, title }: Props) {
  const m = marks[name];
  return (
    <svg
      viewBox={m.viewBox}
      className={className}
      fill="currentColor"
      fillRule="evenodd"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <path d={m.d} />
    </svg>
  );
}

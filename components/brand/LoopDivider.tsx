/** A hand-drawn looping line that separates two cream sections. Use sparingly: once per page. */
export function LoopDivider({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`loop-divider ${className}`} />;
}

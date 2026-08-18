/**
 * Placeholder blocks the Alpha loading artboards draw where the Recent Signals
 * rail will land — plain white cards, no shimmer, matching the file.
 */
export function SkeletonBlock({
  width,
  height,
  radius = 4,
  className = "",
}: {
  width?: number;
  height: number;
  radius?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      style={{ width, height, borderRadius: radius }}
      className={`shrink-0 bg-surface shadow-[0_4px_9px_0_rgb(0_0_0/0.04)] ${className}`}
    />
  );
}

/** The stacked variant: three full-width blocks down the page. */
export function SkeletonList() {
  return (
    <div role="status" aria-label="Loading signals" className="flex flex-col gap-[16px] px-[16px]">
      {[0, 1, 2].map((i) => (
        <SkeletonBlock key={i} height={79} />
      ))}
    </div>
  );
}

/** The rail variant: three cards side by side, the third clipped at the edge. */
export function SkeletonRail() {
  return (
    <div
      role="status"
      aria-label="Loading signals"
      className="no-scrollbar flex gap-[13px] overflow-x-auto px-[13px]"
    >
      {[0, 1, 2].map((i) => (
        <SkeletonBlock key={i} width={133} height={91} />
      ))}
    </div>
  );
}

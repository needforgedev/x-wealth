type RiskMeterProps = {
  /** Filled segments out of `segments`. */
  value: number;
  segments?: number;
  className?: string;
};

/**
 * Three-segment risk indicator: a rounded track with a green fill and hairline
 * separators, matching the 29x7 meter on the signal message card.
 */
export function RiskMeter({ value, segments = 3, className = "" }: RiskMeterProps) {
  const filled = Math.max(0, Math.min(segments, value));

  return (
    <div
      role="img"
      aria-label={`Risk ${filled} of ${segments}`}
      className={`relative h-[7px] w-[29px] overflow-hidden rounded-[19px] bg-meter-track ${className}`}
    >
      <div
        className="h-full rounded-l-[19px] bg-positive"
        style={{ width: `${(filled / segments) * 100}%` }}
      />
      {Array.from({ length: segments - 1 }, (_, i) => (
        <span
          key={i}
          className="absolute inset-y-0 w-px bg-surface"
          style={{ left: `${((i + 1) / segments) * 100}%` }}
        />
      ))}
    </div>
  );
}

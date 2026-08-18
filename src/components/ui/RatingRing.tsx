type RatingRingProps = {
  value: number;
  max?: number;
  /** Outer diameter; the Figma ring is 35px with a 5px stroke. */
  size?: number;
  className?: string;
};

/**
 * Donut gauge with the score in the middle. Drawn rather than exported as a
 * flat asset so the arc tracks the actual rating instead of one fixed value.
 */
export function RatingRing({ value, max = 5, size = 35, className = "" }: RatingRingProps) {
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = Math.max(0, Math.min(1, value / max)) * circumference;

  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-ring-track)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-positive)"
          strokeWidth={stroke}
          strokeDasharray={`${filled} ${circumference}`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-black">
        {value.toFixed(1)}
      </span>
    </div>
  );
}

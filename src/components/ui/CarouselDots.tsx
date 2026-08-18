type CarouselDotsProps = {
  count: number;
  active: number;
  className?: string;
};

/**
 * Slide indicator. Matches the Figma export exactly: the active dot is a solid
 * 10px circle, inactive dots are 9px circles with a 1px ring, both in --color-muted.
 */
export function CarouselDots({ count, active, className = "" }: CarouselDotsProps) {
  return (
    <div
      role="img"
      aria-label={`Slide ${active + 1} of ${count}`}
      className={`flex items-center gap-[15px] ${className}`}
    >
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={
            i === active
              ? "size-[10px] rounded-full bg-muted"
              : "size-[10px] rounded-full border border-muted"
          }
        />
      ))}
    </div>
  );
}

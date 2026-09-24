import { formatPaise } from "@/domain/money";

/**
 * The equity curve, as inline SVG.
 *
 * No chart library. The whole shape is a polyline and a baseline, and a
 * dependency would cost more than it saves — this also keeps it a Server
 * Component, so the curve arrives rendered rather than as data plus JavaScript.
 *
 * Two deliberate choices about honesty:
 *
 * The y-axis is **not** zero-based, because a five-year curve on a zero-based
 * axis is a flat line that hides every drawdown. It is bounded by the actual
 * range, and the starting capital is drawn as a reference line so a reader can
 * see at a glance which side of it the strategy spent its time on.
 *
 * The range is labelled. An unlabelled non-zero axis is the classic way to make
 * a modest result look dramatic, and the labels are what stop this being that.
 */
export function EquityCurve({
  points,
  initialPaise,
}: {
  points: Array<{ date: string; equityPaise: number }>;
  initialPaise: number;
}) {
  if (points.length < 2) {
    return (
      <p className="rounded-[6px] bg-surface-alt p-4 text-[13px] text-muted">
        Too few sessions to plot.
      </p>
    );
  }

  const width = 640;
  const height = 200;
  const padding = { top: 8, right: 8, bottom: 8, left: 8 };

  const values = points.map((p) => p.equityPaise);
  // The baseline is part of the picture, so it has to be inside the bounds or
  // it would be clipped and silently absent.
  const low = Math.min(...values, initialPaise);
  const high = Math.max(...values, initialPaise);
  const span = high - low || 1;

  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const x = (i: number) => padding.left + (i / (points.length - 1)) * plotWidth;
  const y = (value: number) => padding.top + (1 - (value - low) / span) * plotHeight;

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(p.equityPaise).toFixed(2)}`).join(" ");
  const baseline = y(initialPaise);

  const finalValue = values[values.length - 1];
  const ended = finalValue >= initialPaise;

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[200px] w-full"
        role="img"
        aria-label={`Equity from ${formatPaise(values[0] as never, { withPaise: false })} on ${
          points[0].date
        } to ${formatPaise(finalValue as never, { withPaise: false })} on ${
          points[points.length - 1].date
        }`}
      >
        {/* Starting capital. Dashed, so it reads as a reference rather than as
            a second series. */}
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={baseline}
          y2={baseline}
          stroke="currentColor"
          strokeWidth={1}
          strokeDasharray="3 3"
          className="text-muted"
          opacity={0.55}
        />
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
          className={ended ? "text-brand" : "text-danger-ink"}
        />
      </svg>

      <figcaption className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-[12px] text-muted">
        <span>
          {points[0].date} · {formatPaise(values[0] as never, { withPaise: false })}
        </span>
        <span>
          Range {formatPaise(low as never, { withPaise: false })} –{" "}
          {formatPaise(high as never, { withPaise: false })} · dashed line is starting capital
        </span>
        <span>
          {points[points.length - 1].date} ·{" "}
          {formatPaise(finalValue as never, { withPaise: false })}
        </span>
      </figcaption>
    </figure>
  );
}

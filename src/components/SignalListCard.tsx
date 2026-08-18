import { MaskIcon } from "@/components/ui/MaskIcon";
import type { SignalReach } from "@/lib/advisor";
import { SIDE_STYLES, type SignalDetail } from "@/lib/signals";

function Leg({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[9px] font-medium capitalize text-muted">{label}</p>
      <p className="mt-[2px] text-[11px] font-medium capitalize text-ink">{value}</p>
    </div>
  );
}

/**
 * Full-width signal row used on All Signals — adds source group, age and time
 * frame. Passing `reach` appends the views/invested footer the advisor build of
 * the card carries; the investor build omits it.
 */
export function SignalListCard({
  signal,
  reach,
}: {
  signal: SignalDetail;
  reach?: SignalReach;
}) {
  const side = SIDE_STYLES[signal.side];

  return (
    <article className="rounded-[2px] bg-surface pb-[11px] shadow-[0_4px_9px_0_rgb(0_0_0/0.07)]">
      <div className="flex px-[11px] pt-[14px]">
        <span
          className={`flex size-[32px] shrink-0 items-center justify-center rounded-[4px] ${side.chip} ${side.text}`}
        >
          <MaskIcon src={side.icon} width={12.3} height={12.3} />
        </span>

        <div className="ml-[17px] mt-[1px] min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold capitalize text-ink">{signal.side}</p>
          <p className="truncate text-[12px] font-medium capitalize text-muted">{signal.symbol}</p>
        </div>

        <div className="ml-3 mt-[4px] w-[91px] shrink-0">
          <p className="truncate text-right text-[11px] font-medium text-muted">{signal.age}</p>
          <p className="mt-[4px] truncate text-[11px] font-medium capitalize text-ink">
            {signal.source}
          </p>
        </div>
      </div>

      <div className="mt-[13px] h-px bg-muted/[0.08]" />

      <div className="mt-[10px] grid grid-cols-[58px_56px_109px_1fr] px-[11px]">
        <Leg label="Entry" value={signal.entry} />
        <Leg label="Exit" value={signal.exit} />
        <Leg label="StopL" value={signal.stopLoss} />
        <Leg label="Time Frame" value={signal.timeFrame} />
      </div>

      {reach && (
        <div className="mt-[16px] flex justify-end gap-[10px] px-[11px] text-muted">
          <span className="flex items-center gap-[5px]">
            <MaskIcon src="/assets/icon-eye.svg" width={11} height={11} />
            <span className="text-[10px] font-semibold capitalize">{reach.views}</span>
          </span>
          <span className="flex items-center gap-[5px]">
            <MaskIcon src="/assets/icon-check.svg" width={11} height={8.38} />
            <span className="text-[10px] font-semibold capitalize">{reach.invested}</span>
          </span>
        </div>
      )}
    </article>
  );
}

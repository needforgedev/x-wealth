import Image from "next/image";

import { MaskIcon } from "@/components/ui/MaskIcon";
import { SIDE_STYLES, type Signal } from "@/lib/signals";

function Leg({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1">
      <p className="text-[9px] font-medium capitalize text-muted">{label}</p>
      <p className="mt-[2px] text-[11px] font-medium capitalize text-ink">{value}</p>
    </div>
  );
}

/** Compact buy/sell call shown in the horizontally scrolling "Recent Signals" rail. */
export function SignalCard({ signal }: { signal: Signal }) {
  const side = SIDE_STYLES[signal.side];

  return (
    <article className="w-[154px] shrink-0 rounded-[1px] bg-surface px-[9px] pt-[10px] pb-[9px] shadow-[0_4px_9px_0_rgb(0_0_0/0.07)]">
      <div className="flex items-start">
        <span
          className={`flex size-[26px] shrink-0 items-center justify-center rounded-[4px] ${side.chip} ${side.text}`}
        >
          <MaskIcon src={side.icon} width={10} height={10} />
        </span>

        <div className="ml-[10px] min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold capitalize text-ink">
            {signal.side}
          </p>
          <p className="mt-[3px] truncate text-[12px] font-medium capitalize text-muted">
            {signal.symbol}
          </p>
        </div>

        <button
          type="button"
          aria-label={`More options for ${signal.symbol}`}
          className="-mt-[3px] -mr-1 flex size-[16px] shrink-0 items-center justify-center"
        >
          <Image
            src="/assets/icon-more-vert.svg"
            alt=""
            width={3}
            height={11}
            unoptimized
            className="h-[11px] w-[2.7px]"
          />
        </button>
      </div>

      <div className="mt-[11px] h-px bg-muted/[0.08]" />

      <div className="mt-[6px] flex">
        <Leg label="Entry" value={signal.entry} />
        <Leg label="Exit" value={signal.exit} />
        <Leg label="StopL" value={signal.stopLoss} />
      </div>
    </article>
  );
}

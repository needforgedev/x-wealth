import { MaskIcon } from "@/components/ui/MaskIcon";
import type { Holding } from "@/lib/portfolio";

function Meta({ icon, label, className = "" }: { icon: { src: string; width: number; height: number }; label: string; className?: string }) {
  return (
    <span className={`flex items-center text-muted ${className}`}>
      <span className="flex size-[12px] shrink-0 items-center justify-center">
        <MaskIcon src={icon.src} width={icon.width} height={icon.height} />
      </span>
      <span className="ml-[8px] text-[10px] font-medium capitalize whitespace-nowrap">{label}</span>
    </span>
  );
}

/** A single holding on My Stocks: symbol, amount invested, gain, and trade metadata. */
export function HoldingRow({ holding }: { holding: Holding }) {
  return (
    <li className="border-b border-muted/[0.13]">
      <div className="px-[27px] pb-[17px]">
        <div className="flex items-start">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold capitalize text-ink">
              {holding.symbol}
            </p>
            <p className="truncate text-[12px] font-medium capitalize text-muted">
              Invested {holding.invested}
            </p>
          </div>

          <div className="ml-3 mt-[12px] flex shrink-0 items-start gap-[5px]">
            <span className="flex items-center gap-[1px] pt-[4px] text-positive">
              <MaskIcon src="/assets/icon-arrow-drop-up.svg" width={7.08} height={3.54} />
              <span className="text-[9px] font-bold">{holding.changePercent}</span>
            </span>

            <div className="text-right">
              <p className="text-[13px] font-medium capitalize text-ink">{holding.gain}</p>
              <p className="mt-[6px] text-[11px] font-medium capitalize text-muted">
                {holding.ltp}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-[10px] flex">
          <Meta
            className="w-[67px] shrink-0"
            icon={{ src: "/assets/icon-work-outline.svg", width: 10, height: 9.5 }}
            label={holding.qty}
          />
          <Meta
            icon={{ src: "/assets/icon-price-tag.svg", width: 9.06, height: 8.99 }}
            label={holding.avg}
          />
        </div>
      </div>
    </li>
  );
}

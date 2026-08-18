import Image from "next/image";

import { MARKET_INDICES, type MarketIndex } from "@/lib/alpha";

function Tile({ index }: { index: MarketIndex }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col px-[24px] pt-[17px] pb-[10px]">
      <div className="flex items-center gap-[8px]">
        <span
          aria-hidden
          style={{ backgroundColor: index.dot }}
          className="size-[7px] shrink-0 rounded-full"
        />
        <p className="truncate text-[10px] font-bold uppercase text-[#a6a8a9]">{index.name}</p>
      </div>

      <div className="mt-[3px] flex items-center">
        <p className="text-[15px] font-semibold text-black">{index.level}</p>
        <span className="ml-[6px] flex items-center gap-[1px]">
          <Image
            src="/assets/icon-arrow-drop-up.svg"
            alt=""
            width={10}
            height={5}
            unoptimized
            className="h-[5px] w-[10px]"
          />
          <span className="text-[9px] font-bold text-positive">{index.delta}</span>
        </span>
      </div>

      {/* 108x35 sparkline, scaled to the tile and pinned to its baseline. */}
      <svg
        aria-hidden
        viewBox="0 0 108 35"
        preserveAspectRatio="none"
        className="mt-auto h-[35px] w-full"
      >
        <path d={index.spark} fill="#22C18E" />
      </svg>
    </div>
  );
}

/**
 * Market strip above the group list — two index tiles side by side, split by a
 * hairline. The artboard clips a third tile at the right edge, so the row
 * scrolls rather than squeezing the tiles.
 */
export function MarketCard({ className = "" }: { className?: string }) {
  return (
    <section
      aria-label="Market indices"
      className={`h-[136px] overflow-hidden rounded-[12px] bg-surface shadow-[0_4px_9px_0_rgb(0_0_0/0.04)] ${className}`}
    >
      <div className="no-scrollbar flex h-full overflow-x-auto">
        {MARKET_INDICES.map((index, i) => (
          <div key={index.id} className="flex h-full min-w-[172px] flex-1">
            {i > 0 && <span aria-hidden className="my-[15px] w-px shrink-0 bg-[#dfdfdf]" />}
            <Tile index={index} />
          </div>
        ))}
      </div>
    </section>
  );
}

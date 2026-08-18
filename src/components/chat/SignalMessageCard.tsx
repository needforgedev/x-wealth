import Link from "next/link";

import { MaskIcon } from "@/components/ui/MaskIcon";
import { RiskMeter } from "@/components/ui/RiskMeter";
import { SIDE_STYLES, type SignalSide } from "@/lib/signals";

export type SignalMessage = {
  side: SignalSide;
  symbol: string;
  entry: string;
  exit: string;
  stopLoss: string;
  timeFrame: string;
  risk: number;
  targets: Array<{ label: string; value: string }>;
  likes?: number;
  comments: number;
};

function Leg({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[9px] font-medium capitalize text-muted">{label}</p>
      <p className="mt-[2px] text-[12px] font-medium capitalize text-ink">{value}</p>
    </div>
  );
}

/** A trading call posted into a group conversation, with reactions and a thread link. */
export function SignalMessageCard({
  signal,
  threadHref,
}: {
  signal: SignalMessage;
  /** Omit on the thread screen itself, where the link would be a no-op. */
  threadHref?: string;
}) {
  const side = SIDE_STYLES[signal.side];

  return (
    <div className="rounded-tr-[12px] rounded-b-[12px] bg-surface shadow-[0_4px_9px_0_rgb(0_0_0/0.04)]">
      <div className="px-[16px] pt-[15px]">
        <div className="flex items-start">
          <span
            className={`flex size-[32px] shrink-0 items-center justify-center rounded-[4px] ${side.chip} ${side.text}`}
          >
            <MaskIcon src={side.icon} width={12.3} height={12.3} />
          </span>

          <div className="ml-[17px] min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold capitalize text-ink">{signal.side}</p>
            <p className="truncate text-[12px] font-medium capitalize text-muted">
              {signal.symbol}
            </p>
          </div>

          <div className="ml-2 flex shrink-0 gap-[26px] pt-[5px]">
            <Leg label="Entry" value={signal.entry} />
            <Leg label="Exit" value={signal.exit} />
            <Leg label="StopL" value={signal.stopLoss} />
          </div>
        </div>

        <div className="mt-[20px] flex">
          <div className="w-[103px] shrink-0">
            <p className="text-[9px] font-medium capitalize text-muted">Time Frame</p>
            <p className="mt-[2px] text-[11px] font-medium capitalize text-ink">
              {signal.timeFrame}
            </p>
            <div className="mt-[16px] flex items-center gap-[9px]">
              <p className="text-[9px] font-medium uppercase text-muted">Risk Mtr</p>
              <RiskMeter value={signal.risk} />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-medium capitalize text-muted">Expected Price</p>
            <div className="mt-[8px] flex gap-[7px]">
              {signal.targets.map((target) => (
                <div
                  key={target.label}
                  className="flex h-[38px] flex-1 flex-col items-center justify-center rounded-[5px] bg-[#091430]/[0.05]"
                >
                  <span className="text-[9px] font-medium uppercase text-muted">
                    {target.label}
                  </span>
                  <span className="mt-[1px] text-[12px] font-medium capitalize text-ink">
                    {target.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-[16px] h-px bg-muted/[0.13]" />

      <div className="flex h-[47px] items-center px-[17px]">
        <button type="button" aria-label="Like" className="flex size-[20px] items-center justify-center text-muted">
          <MaskIcon src="/assets/icon-heart.svg" width={16.67} height={15.29} />
        </button>

        <button type="button" className="ml-[16px] flex items-center gap-[7px] text-muted">
          <MaskIcon src="/assets/icon-comment.svg" width={16.67} height={16.67} />
          <span className="text-[12px] font-semibold capitalize">{signal.comments}</span>
        </button>

        {threadHref ? (
          <Link href={threadHref} className="ml-[8px] flex items-center gap-[8px] text-thread">
            <span className="text-[12px] font-semibold uppercase">Thread</span>
            <MaskIcon src="/assets/icon-chevron-right.svg" width={5.84} height={9.9} />
          </Link>
        ) : (
          <span className="ml-[8px] flex items-center gap-[8px] text-thread">
            <span className="text-[12px] font-semibold uppercase">Thread</span>
            <MaskIcon src="/assets/icon-chevron-right.svg" width={5.84} height={9.9} />
          </span>
        )}

        <button type="button" className="ml-auto flex items-center gap-[10px] text-ink">
          <MaskIcon src="/assets/icon-add.svg" width={11.67} height={11.67} />
          <span className="text-[12px] font-semibold uppercase">Invest</span>
        </button>
      </div>
    </div>
  );
}

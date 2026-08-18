"use client";

import Image from "next/image";
import { useState } from "react";

import { SectionHeader } from "@/components/SectionHeader";
import { MaskIcon } from "@/components/ui/MaskIcon";
import { PORTFOLIO_SUMMARY, RANGES } from "@/lib/portfolio";

function Stat({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[9px] font-medium capitalize text-muted">{label}</p>
      <p className="mt-[4px] text-[16px] font-medium capitalize text-ink">{value}</p>
    </div>
  );
}

/** Portfolio value card with its range selector — shared by the portfolio screens. */
export function PortfolioSummary() {
  const [range, setRange] = useState<string>(RANGES[0]);

  return (
    <>
      <SectionHeader
        className="mt-[30px] shrink-0 px-[24px]"
        icon={{ src: "/assets/nav-portfolio.svg", width: 12.25, height: 12.25 }}
        title="My Portfolio"
        action={
          <div role="group" aria-label="Chart range" className="flex gap-[15px]">
            {RANGES.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={item === range}
                onClick={() => setRange(item)}
                className={`text-[12px] font-semibold capitalize ${
                  item === range ? "text-ink" : "text-muted"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        }
      />

      <section className="mx-[24px] mt-[19px] shrink-0 rounded-[1px] bg-surface pb-[15px] shadow-[0_4px_9px_0_rgb(0_0_0/0.07)]">
        <div className="px-[20px] pt-[22px]">
          <p className="text-[12px] font-semibold tracking-[-0.21px] text-muted">Portfolio Value</p>
          <div className="mt-[5px] flex items-center">
            <p className="text-[20px] font-semibold text-ink">{PORTFOLIO_SUMMARY.value}</p>
            <span className="ml-[24px] flex items-center gap-[2px] text-positive">
              <MaskIcon src="/assets/icon-arrow-drop-up.svg" width={10} height={5} />
              <span className="text-[11px] font-bold">{PORTFOLIO_SUMMARY.changePercent}</span>
            </span>
          </div>
        </div>

        {/* Static export from Figma — swap for a data-driven chart once real
            series data exists; there is none in the design file. */}
        <div className="mt-[19px] px-[24px]">
          <Image
            src="/assets/portfolio-chart.svg"
            alt="Portfolio value over time"
            width={270}
            height={68}
            unoptimized
            className="h-[67.4px] w-full"
          />
        </div>

        <div className="mt-[24px] h-px bg-muted/[0.08]" />

        <div className="mt-[18px] flex px-[21px]">
          <Stat label="Invested" value={PORTFOLIO_SUMMARY.invested} className="w-[112px]" />
          <Stat label="P&L" value={PORTFOLIO_SUMMARY.pnl} className="w-[103px]" />
          <Stat label="Annual CAGR" value={PORTFOLIO_SUMMARY.cagr} className="flex-1" />
        </div>
      </section>
    </>
  );
}

import type { ReactNode } from "react";

import { MaskIcon } from "@/components/ui/MaskIcon";

type SectionHeaderProps = {
  icon: { src: string; width: number; height: number };
  title: string;
  action?: ReactNode;
  className?: string;
};

/** Leading icon, section title, and an optional right-aligned action. */
export function SectionHeader({ icon, title, action, className = "" }: SectionHeaderProps) {
  return (
    <div className={`flex items-center ${className}`}>
      <span className="flex size-[21px] shrink-0 items-center justify-center text-ink">
        <MaskIcon src={icon.src} width={icon.width} height={icon.height} />
      </span>
      <h2 className="ml-[13px] text-[14px] font-semibold capitalize text-ink">{title}</h2>
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

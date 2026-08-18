"use client";

import Image from "next/image";

import { MaskIcon } from "@/components/ui/MaskIcon";
import type { JoinableGroup } from "@/lib/alpha";

/**
 * One selectable group on the Join Groups step. Selection is a filled brand
 * check in place of the empty outline — the artboard has no separate label, so
 * the button carries the group name for assistive tech.
 */
export function JoinGroupRow({
  group,
  selected,
  onToggle,
}: {
  group: JoinableGroup;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="flex items-center">
      <span
        style={{ backgroundColor: group.tint }}
        className="flex size-[47px] shrink-0 items-center justify-center rounded-full"
      >
        <Image
          src="/assets/group-emblem.png"
          alt=""
          width={21}
          height={21}
          className="size-[21px] opacity-50"
        />
      </span>

      <div className="ml-[22px] min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold capitalize text-ink">{group.name}</p>
        <p className="mt-[5px] truncate text-[13px] font-semibold text-muted">{group.members}</p>
      </div>

      <button
        type="button"
        aria-pressed={selected}
        aria-label={`Join ${group.name}`}
        onClick={onToggle}
        className={`ml-3 flex size-[23px] shrink-0 items-center justify-center rounded-full ${
          selected ? "bg-brand text-white" : "border border-[#c9c9c9] text-transparent"
        }`}
      >
        <MaskIcon src="/assets/icon-check.svg" width={11} height={8.4} />
      </button>
    </li>
  );
}

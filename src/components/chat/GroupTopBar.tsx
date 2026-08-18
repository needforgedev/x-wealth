"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";

import { MaskIcon } from "@/components/ui/MaskIcon";

type GroupTopBarProps = {
  name: string;
  members: string;
  tint?: string;
  backHref?: string;
  href?: string;
  /** `light` is the Alpha treatment — dark type on a white bar. */
  tone?: "brand" | "light";
};

/** Conversation header: back, group identity, and an overflow menu. */
export function GroupTopBar({
  name,
  members,
  tint = "#E6E0FF",
  backHref = "/chats",
  href,
  tone = "brand",
}: GroupTopBarProps) {
  const router = useRouter();
  const isLight = tone === "light";

  return (
    <header
      className={`relative flex h-[60px] shrink-0 items-center pl-[16px] pr-[10px] ${
        isLight ? "bg-surface" : "bg-brand"
      }`}
    >
      <button
        type="button"
        aria-label="Go back"
        onClick={() => router.push(backHref)}
        className={`flex size-[44px] shrink-0 items-center justify-center ${
          isLight ? "text-ink" : "text-white"
        }`}
      >
        <MaskIcon src="/assets/icon-arrow-back.svg" width={15.33} height={15.33} />
      </button>

      <button
        type="button"
        onClick={() => href && router.push(href)}
        className="ml-[6px] flex min-w-0 flex-1 items-center text-left"
      >
        <span
          style={{ backgroundColor: tint }}
          className="flex size-[36px] shrink-0 items-center justify-center rounded-full"
        >
          <Image
            src="/assets/group-emblem.png"
            alt=""
            width={16}
            height={16}
            className="size-[16.09px] opacity-50"
          />
        </span>
        <span className="ml-[19px] min-w-0">
          <span
            className={`block truncate text-[14px] font-semibold capitalize ${
              isLight ? "text-[#3f3f3f]" : "text-white"
            }`}
          >
            {name}
          </span>
          <span
            className={`mt-[3px] block truncate text-[13px] font-semibold capitalize ${
              isLight ? "text-[#282828]/56" : "text-white/56"
            }`}
          >
            {members}
          </span>
        </span>
      </button>

      <button
        type="button"
        aria-label="Group options"
        className={`flex size-[44px] shrink-0 items-center justify-center ${
          isLight ? "text-ink" : "text-white"
        }`}
      >
        <MaskIcon src="/assets/icon-more-vert.svg" width={3.5} height={14} />
      </button>
    </header>
  );
}

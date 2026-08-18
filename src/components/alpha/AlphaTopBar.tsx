"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";

import { MaskIcon } from "@/components/ui/MaskIcon";

type AlphaTopBarProps = {
  /**
   * `account` is the signed-in header — avatar with a switch badge on the left
   * and a notification bell on the right. `menu` is the earlier hamburger
   * treatment, and `back` is the header the discovery screens use.
   */
  variant?: "account" | "menu" | "back";
  /** `light` paints the bar white with the blue wordmark, as on Group Discovery. */
  tone?: "brand" | "light";
  backHref?: string;
};

/**
 * The Alpha 60px header. Same height and centred wordmark as `TopBar`, but the
 * Alpha artboards hang different affordances off it, so it is its own component
 * rather than another set of flags on the investor bar.
 */
export function AlphaTopBar({
  variant = "account",
  tone = "brand",
  backHref = "/alpha/chats",
}: AlphaTopBarProps) {
  const router = useRouter();
  const isLight = tone === "light";

  return (
    <header
      className={`relative h-[60px] shrink-0 ${isLight ? "bg-surface" : "bg-brand"} ${
        isLight ? "text-ink" : "text-white"
      }`}
    >
      {variant === "account" && (
        <button
          type="button"
          aria-label="Switch account"
          onClick={() => router.push("/account/switch")}
          className="absolute left-[20px] top-1/2 size-[37px] -translate-y-1/2"
        >
          <Image
            src="/assets/user-photo.png"
            alt=""
            width={37}
            height={37}
            className="size-[37px] rounded-full object-cover ring-2 ring-white"
          />
          <span className="absolute -bottom-[1px] -right-[6px] flex size-[17px] items-center justify-center rounded-full bg-surface text-brand">
            <MaskIcon src="/assets/icon-swap.svg" width={11} height={11} />
          </span>
        </button>
      )}

      {variant === "back" && (
        <button
          type="button"
          aria-label="Go back"
          onClick={() => router.push(backHref)}
          className="absolute left-[12px] top-1/2 flex size-[44px] -translate-y-1/2 items-center justify-center"
        >
          <MaskIcon src="/assets/icon-arrow-back.svg" width={15.33} height={15.33} />
        </button>
      )}

      <Image
        src={isLight ? "/assets/logo-xwealth.svg" : "/assets/logo-xwealth-small-white.svg"}
        alt="X Wealth"
        width={87}
        height={26}
        priority
        unoptimized
        className="absolute left-1/2 top-[17px] h-[26px] w-[87.42px] -translate-x-1/2"
      />

      {variant === "account" && (
        <button
          type="button"
          aria-label="Notifications"
          className="absolute right-[24px] top-1/2 flex size-[44px] -translate-y-1/2 items-center justify-center"
        >
          <MaskIcon src="/assets/icon-bell.svg" width={24} height={24} />
        </button>
      )}

      {variant === "menu" && (
        <button
          type="button"
          aria-label="Open menu"
          className="absolute right-[15px] top-1/2 flex size-[44px] -translate-y-1/2 items-center justify-center"
        >
          <MaskIcon src="/assets/icon-menu.svg" width={19.5} height={13} />
        </button>
      )}
    </header>
  );
}

"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";

import { MaskIcon } from "@/components/ui/MaskIcon";

type TopBarProps = {
  onMenuClick?: () => void;
  showBack?: boolean;
  backHref?: string;
  className?: string;
};

/** Brand-filled 60px header with the compact wordmark and a menu affordance. */
export function TopBar({
  onMenuClick,
  showBack = false,
  backHref,
  className = "",
}: TopBarProps) {
  const router = useRouter();

  return (
    <header className={`relative h-[60px] shrink-0 bg-brand ${className}`}>
      {showBack && (
        <button
          type="button"
          aria-label="Go back"
          onClick={() => (backHref ? router.push(backHref) : router.back())}
          className="absolute left-[16px] top-1/2 flex size-[44px] -translate-y-1/2 items-center justify-center text-white"
        >
          <MaskIcon src="/assets/icon-arrow-back.svg" width={15.33} height={15.33} />
        </button>
      )}

      <Image
        src="/assets/logo-xwealth-small-white.svg"
        alt="X Wealth"
        width={87}
        height={26}
        priority
        unoptimized
        className="absolute left-1/2 top-[17px] h-[26px] w-[87.42px] -translate-x-1/2"
      />

      <button
        type="button"
        aria-label="Open menu"
        onClick={onMenuClick}
        className="absolute right-[19px] top-1/2 flex size-[44px] -translate-y-1/2 items-center justify-center text-white"
      >
        <MaskIcon src="/assets/icon-menu.svg" width={19.5} height={13} />
      </button>
    </header>
  );
}

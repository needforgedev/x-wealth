"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";

type AppBarProps = {
  /** `logo` shows the X Wealth wordmark, `title` shows centred text. */
  variant?: "logo" | "title";
  title?: string;
  /** Explicit destination for the back button; falls back to browser history. */
  backHref?: string;
  showBack?: boolean;
  /** `inverse` swaps in the white wordmark and arrow, for brand-filled screens. */
  tone?: "default" | "inverse";
  className?: string;
};

/**
 * Top bar used across the onboarding screens: a back affordance on the left and
 * either the wordmark or a title centred. Height matches the Figma artboards,
 * where the wordmark sits at y=45 and the back arrow glyph at y=30.
 */
export function AppBar({
  variant = "logo",
  title,
  backHref,
  showBack = true,
  tone = "default",
  className = "",
}: AppBarProps) {
  const router = useRouter();
  const isInverse = tone === "inverse";

  return (
    <div className={`relative h-[87px] shrink-0 ${className}`}>
      {showBack && (
        <button
          type="button"
          aria-label="Go back"
          onClick={() => (backHref ? router.push(backHref) : router.back())}
          // 44px tap target centred on the 17.33px glyph at (30.33, 30.33).
          className="absolute left-[17px] top-[17px] flex size-[44px] items-center justify-center"
        >
          <Image
            src={isInverse ? "/assets/icon-arrow-back-white.svg" : "/assets/icon-arrow-back.svg"}
            alt=""
            width={18}
            height={18}
            unoptimized
            className="size-[17.33px]"
          />
        </button>
      )}

      {variant === "logo" ? (
        <Image
          src={isInverse ? "/assets/logo-xwealth-white.svg" : "/assets/logo-xwealth.svg"}
          alt="X Wealth"
          width={141}
          height={42}
          priority
          unoptimized
          className="absolute left-1/2 top-[45px] h-[42px] w-[141.217px] -translate-x-1/2"
        />
      ) : (
        <p
          className={`absolute left-1/2 top-[45px] -translate-x-1/2 text-[20px] font-semibold ${
            isInverse ? "text-white" : "text-ink"
          }`}
        >
          {title}
        </p>
      )}
    </div>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { MaskIcon } from "@/components/ui/MaskIcon";

export type NavTab = {
  href: string;
  label: string;
  src: string;
  width: number;
  height: number;
};

export const INVESTOR_TABS: ReadonlyArray<NavTab> = [
  { href: "/chats", label: "Chats", src: "/assets/nav-chat.svg", width: 20, height: 20 },
  { href: "/signals", label: "Signals", src: "/assets/nav-signals.svg", width: 18, height: 10 },
  { href: "/portfolio", label: "Portfolio", src: "/assets/nav-portfolio.svg", width: 14, height: 14 },
  { href: "/discover", label: "Discover", src: "/assets/nav-search.svg", width: 17.49, height: 17.49 },
  { href: "/profile", label: "Profile", src: "/assets/nav-profile.svg", width: 16, height: 16 },
];

/**
 * Same five glyphs as the investor bar — the advisor artboards only re-point
 * the first two. Portfolio, Discover and Profile have no advisor-specific
 * artboard, so they stay on the shared screens.
 */
export const ADVISOR_TABS: ReadonlyArray<NavTab> = [
  { href: "/advisor/chats", label: "Chats", src: "/assets/nav-chat.svg", width: 20, height: 20 },
  { href: "/advisor/signals", label: "Signals", src: "/assets/nav-signals.svg", width: 18, height: 10 },
  { href: "/portfolio", label: "Portfolio", src: "/assets/nav-portfolio.svg", width: 14, height: 14 },
  { href: "/discover", label: "Discover", src: "/assets/nav-search.svg", width: 17.49, height: 17.49 },
  { href: "/profile", label: "Profile", src: "/assets/nav-profile.svg", width: 16, height: 16 },
];

/**
 * Fixed 55px tab bar. Left/right padding is asymmetric on purpose — it
 * reproduces the artboard's 48px gaps between the five 24px hit areas.
 *
 * `avatarSrc` swaps the profile glyph for the signed-in user's photo, which is
 * how the account screens render it.
 */
export function BottomNav({
  tabs = INVESTOR_TABS,
  avatarSrc,
}: {
  tabs?: ReadonlyArray<NavTab>;
  avatarSrc?: string;
} = {}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="sticky bottom-0 z-10 flex h-[55px] shrink-0 items-center justify-between bg-surface pl-[25px] pr-[38px] shadow-[0_4px_12px_0_rgb(0_0_0/0.33)]"
    >
      {tabs.map((tab) => {
        const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-label={tab.label}
            aria-current={isActive ? "page" : undefined}
            className={`flex size-[24px] items-center justify-center ${
              isActive ? "text-ink" : "text-muted"
            }`}
          >
            {avatarSrc && tab.label === "Profile" ? (
              <Image
                src={avatarSrc}
                alt=""
                width={24}
                height={24}
                className="size-[24px] rounded-full object-cover"
              />
            ) : (
              <MaskIcon src={tab.src} width={tab.width} height={tab.height} />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

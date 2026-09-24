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

/**
 * Two tabs, not five.
 *
 * The bar was Chats · Signals · Portfolio · Discover · Profile, and three of
 * those were the distribution surface — a chat channel, a signal feed, and
 * advisor discovery. `CLAUDE.md` §8.5 prohibits all three, so they are gone
 * along with the routes behind them (`plan.md` W10-15).
 *
 * `ADVISOR_TABS` went with them. It only ever re-pointed the first two entries
 * at `/advisor/chats` and `/advisor/signals`; with those deleted it was the
 * same list twice, and no page renders a second variant anyway.
 *
 * `INVESTOR_TABS` is now `DEFAULT_TABS`: W24 collapsed the two personas into
 * one user, so a name that distinguishes this list from a persona that no
 * longer exists describes the product we abandoned.
 *
 * This is still a holding shape, not a designed one — the trader's primary
 * destination is their strategy list, and this bar has not been rebuilt around
 * it yet.
 */
export const DEFAULT_TABS: ReadonlyArray<NavTab> = [
  { href: "/portfolio", label: "Portfolio", src: "/assets/nav-portfolio.svg", width: 14, height: 14 },
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
  tabs = DEFAULT_TABS,
  avatarSrc,
}: {
  tabs?: ReadonlyArray<NavTab>;
  avatarSrc?: string;
} = {}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      // Centred with a fixed gap rather than the artboard's `justify-between`
      // and asymmetric padding. That spacing existed to reproduce the 48px gaps
      // between five hit areas; with two tabs left it flings them into opposite
      // corners. Revisit when W24 settles what this bar actually contains.
      className="sticky bottom-0 z-10 flex h-[55px] shrink-0 items-center justify-center gap-[48px] bg-surface shadow-[0_4px_12px_0_rgb(0_0_0/0.33)]"
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

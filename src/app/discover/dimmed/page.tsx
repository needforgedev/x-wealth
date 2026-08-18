import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { DiscoverScreenBody } from "@/components/screens/DiscoverScreenBody";

/**
 * Group Discovery, second artboard (1788:2694). It is the same screen with a
 * 69% scrim over it and nothing layered on top — the sheet or menu it was meant
 * to sit behind was never drawn, so this reproduces the dimmed state as-is.
 */
export default function DiscoverDimmedPage() {
  return (
    <AppShell className="relative bg-surface-alt">
      <DiscoverScreenBody />
      <Link
        href="/discover"
        aria-label="Dismiss"
        className="absolute inset-0 z-20 bg-[#322e2e]/[0.69]"
      />
    </AppShell>
  );
}

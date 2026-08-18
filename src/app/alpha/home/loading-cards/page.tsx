import { AppShell } from "@/components/AppShell";
import { BottomNav } from "@/components/BottomNav";
import { AlphaGroupList } from "@/components/alpha/AlphaGroupList";
import { AlphaTopBar } from "@/components/alpha/AlphaTopBar";
import { MarketCard } from "@/components/alpha/MarketCard";
import { SkeletonRail } from "@/components/alpha/Skeleton";
import { ALPHA_TABS } from "@/lib/alpha";

/** The same loading moment drawn as a card rail rather than a stacked list. */
export default function AlphaHomeLoadingCardsPage() {
  return (
    <AppShell className="bg-surface-alt">
      <AlphaTopBar variant="menu" />

      <MarketCard className="mx-[13px] mt-[16px] shrink-0" />

      <div className="mt-[34px] shrink-0">
        <SkeletonRail />
      </div>

      <AlphaGroupList limit={1} />

      <BottomNav tabs={ALPHA_TABS} />
    </AppShell>
  );
}

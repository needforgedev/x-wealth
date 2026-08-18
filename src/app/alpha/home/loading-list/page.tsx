import { AppShell } from "@/components/AppShell";
import { BottomNav } from "@/components/BottomNav";
import { AlphaGroupList } from "@/components/alpha/AlphaGroupList";
import { AlphaTopBar } from "@/components/alpha/AlphaTopBar";
import { MarketCard } from "@/components/alpha/MarketCard";
import { SkeletonList } from "@/components/alpha/Skeleton";
import { ALPHA_TABS } from "@/lib/alpha";

/** Home while the signals section is still resolving — stacked placeholders. */
export default function AlphaHomeLoadingListPage() {
  return (
    <AppShell className="bg-surface-alt">
      <AlphaTopBar variant="menu" />

      <MarketCard className="mx-[13px] mt-[16px] shrink-0" />

      <div className="mt-[33px] shrink-0">
        <SkeletonList />
      </div>

      <AlphaGroupList limit={1} />

      <BottomNav tabs={ALPHA_TABS} />
    </AppShell>
  );
}

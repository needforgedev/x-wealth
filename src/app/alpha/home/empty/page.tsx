import { AppShell } from "@/components/AppShell";
import { BottomNav } from "@/components/BottomNav";
import { AlphaTopBar } from "@/components/alpha/AlphaTopBar";
import { EmptyGroups } from "@/components/alpha/EmptyGroups";
import { MarketCard } from "@/components/alpha/MarketCard";
import { ALPHA_TABS } from "@/lib/alpha";

/** Home before the user has joined anything — market strip, then the empty state. */
export default function AlphaHomeEmptyPage() {
  return (
    <AppShell className="bg-surface-alt">
      <AlphaTopBar variant="menu" />

      <MarketCard className="mx-[13px] mt-[16px] shrink-0" />

      <EmptyGroups />

      <BottomNav tabs={ALPHA_TABS} />
    </AppShell>
  );
}

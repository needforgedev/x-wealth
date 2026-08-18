import { AppShell } from "@/components/AppShell";
import { BottomNav } from "@/components/BottomNav";
import { AlphaGroupList } from "@/components/alpha/AlphaGroupList";
import { AlphaTopBar } from "@/components/alpha/AlphaTopBar";
import { MarketCard } from "@/components/alpha/MarketCard";
import { ALPHA_TABS } from "@/lib/alpha";

/**
 * The later Alpha home: the Recent Signals rail is replaced by a market strip,
 * and the header goes back to a hamburger. Kept as its own route because the
 * two treatments coexist in the file.
 */
export default function AlphaHomePage() {
  return (
    <AppShell className="bg-surface-alt">
      <AlphaTopBar variant="menu" />

      <MarketCard className="mx-[13px] mt-[16px] shrink-0" />

      <AlphaGroupList />

      <BottomNav tabs={ALPHA_TABS} />
    </AppShell>
  );
}

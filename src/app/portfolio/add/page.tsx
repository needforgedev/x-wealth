import { AddToPortfolioSheet } from "@/components/AddToPortfolioSheet";
import { AppShell } from "@/components/AppShell";
import { BottomNav } from "@/components/BottomNav";
import { PortfolioSummary } from "@/components/screens/PortfolioSummary";
import { TopBar } from "@/components/TopBar";

/**
 * My Portfolio with the Add to Portfolio sheet (806:1109). Frame 17:4082 is the
 * same state without the ACTION label, so it maps to this screen too.
 */
export default function AddToPortfolioPage() {
  return (
    <AppShell className="bg-surface-alt">
      <TopBar showBack backHref="/portfolio" />
      <PortfolioSummary />
      <div className="flex-1" />
      <AddToPortfolioSheet onSubmitHref="/portfolio" />
      <BottomNav />
    </AppShell>
  );
}

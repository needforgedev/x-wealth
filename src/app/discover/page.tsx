import { AppShell } from "@/components/AppShell";
import { DiscoverScreenBody } from "@/components/screens/DiscoverScreenBody";

/** Group Discovery (15:3520). */
export default function DiscoverPage() {
  return (
    <AppShell className="bg-surface-alt">
      <DiscoverScreenBody />
    </AppShell>
  );
}

import { AlphaDiscoverShell } from "@/components/alpha/AlphaDiscoverShell";
import { DiscoverListCard } from "@/components/alpha/DiscoverListCard";
import { DISCOVER_LISTINGS } from "@/lib/alpha";

/** Group Discovery, Alpha's list-panel treatment. */
export default function AlphaDiscoverPage() {
  return (
    <AlphaDiscoverShell tone="light">
      <div className="mt-[29px] flex-1 rounded-[6px] bg-surface shadow-[0_4px_9px_0_rgb(0_0_0/0.04)]">
        {DISCOVER_LISTINGS.map((listing) => (
          <DiscoverListCard key={listing.id} listing={listing} />
        ))}
      </div>
    </AlphaDiscoverShell>
  );
}

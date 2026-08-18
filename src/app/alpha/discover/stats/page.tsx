import { GroupCard } from "@/components/GroupCard";
import { AlphaDiscoverShell } from "@/components/alpha/AlphaDiscoverShell";
import { ALPHA_DISCOVERY_GROUPS } from "@/lib/alpha";

/** The same discovery screen drawn with per-group stat cards and a brand header. */
export default function AlphaDiscoverStatsPage() {
  return (
    <AlphaDiscoverShell tone="brand">
      <div className="flex flex-1 flex-col gap-[15px] px-[27px] pt-[36px] pb-6">
        {ALPHA_DISCOVERY_GROUPS.map((group) => (
          <GroupCard key={group.id} group={group} />
        ))}
      </div>
    </AlphaDiscoverShell>
  );
}

"use client";

import { SegmentedTabs, type SegmentedTab } from "@/components/ui/SegmentedTabs";

export type Role = "investor" | "advisor";

const ROLES: ReadonlyArray<SegmentedTab> = [
  { id: "investor", label: "Investor" },
  { id: "advisor", label: "Advisor" },
];

type RoleTabsProps = {
  value: Role;
  onChange: (role: Role) => void;
};

/** Investor/Advisor switch on Get Started. */
export function RoleTabs({ value, onChange }: RoleTabsProps) {
  return (
    <SegmentedTabs
      label="Account type"
      tabs={ROLES}
      value={value}
      onChange={(id) => onChange(id as Role)}
      idPrefix="tab"
    />
  );
}

import type { RadioCardOption } from "@/components/ui/RadioCardGroup";

export const PLANS: ReadonlyArray<RadioCardOption> = [
  { id: "basic", title: "Basic", description: "₹345/mo, 10 Signals a Day" },
  { id: "pro", title: "Pro", description: "₹345/mo, 10 Signals a Day" },
  { id: "expert", title: "Expert", description: "₹345/mo, 10 Signals a Day" },
];

/** Headline figures shown on the group profile. */
export const GROUP_PROFILE = {
  sebiId: "INP000005847",
  aum: "345%",
  aumDelta: "23%",
  accuracy: "94%",
  rating: 4.9,
} as const;

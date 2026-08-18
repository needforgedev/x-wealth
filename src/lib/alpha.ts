import type { NavTab } from "@/components/BottomNav";
import type { ChatThread } from "@/lib/chats";
import { CHAT_THREADS } from "@/lib/chats";
import type { Group } from "@/lib/groups";
import { DISCOVERY_GROUPS } from "@/lib/groups";

/**
 * Data for the Alpha page of the Figma file — a second pass at onboarding and
 * home that the Investor/Advisor pages don't have: Google sign-in, a combined
 * experience + interests step, a join-a-group step, and a market strip above
 * the group list.
 *
 * Figures here are artboard placeholders, not real or implied performance.
 */

/** Alpha's tab bar is the same five glyphs, re-pointed at the Alpha routes. */
export const ALPHA_TABS: ReadonlyArray<NavTab> = [
  { href: "/alpha/chats", label: "Chats", src: "/assets/nav-chat.svg", width: 20, height: 20 },
  { href: "/alpha/home", label: "Signals", src: "/assets/nav-signals.svg", width: 18, height: 10 },
  { href: "/portfolio", label: "Portfolio", src: "/assets/nav-portfolio.svg", width: 14, height: 14 },
  { href: "/alpha/discover", label: "Discover", src: "/assets/nav-search.svg", width: 17.49, height: 17.49 },
  { href: "/profile", label: "Profile", src: "/assets/nav-profile.svg", width: 16, height: 16 },
];

export type MarketIndex = {
  id: string;
  name: string;
  level: string;
  delta: string;
  /** Dot beside the index name — each tile gets its own tint in the design. */
  dot: string;
  /** Sparkline path, drawn in a 108x35 viewBox. */
  spark: string;
};

export const MARKET_INDICES: MarketIndex[] = [
  {
    id: "nifty50",
    name: "NIFTY50",
    level: "10,293",
    delta: "23%",
    dot: "#6580DF",
    spark: "M0 30 L14 22 L27 26 L41 12 L55 18 L68 8 L82 14 L95 4 L108 9 L108 35 L0 35 Z",
  },
  {
    id: "sensex",
    name: "SENSEX",
    level: "40,293",
    delta: "17%",
    dot: "#DF65D3",
    spark: "M0 26 L15 20 L29 24 L43 14 L57 19 L71 10 L85 15 L108 6 L108 35 L0 35 Z",
  },
];

/** Experience options on the combined onboarding step. */
export const EXPERIENCE_LEVELS = [
  "Beginner : 0-1 year",
  "Intermediate : 1-3 years",
  "Expert : 3-5 years",
  "Super Pro : 5+ years",
] as const;

/**
 * Interest chips. The artboard repeats several labels, so each carries a unique
 * id and toggles independently.
 */
export const ALPHA_INTERESTS = [
  { id: "bank-nifty", label: "Bank NIFTY" },
  { id: "intraday-1", label: "Intraday" },
  { id: "forex-1", label: "Forex" },
  { id: "day-trading-1", label: "Day Trading" },
  { id: "long-term-1", label: "Long term" },
  { id: "intraday-2", label: "Intraday" },
  { id: "day-trading-2", label: "Day Trading" },
  { id: "forex-2", label: "Forex" },
] as const;

/** Category rail above the Join Groups list. */
export const JOIN_FILTERS = ["Popular", "Bank NIFTY", "Intraday", "Day Trading"] as const;

export type JoinableGroup = {
  id: string;
  name: string;
  members: string;
  tint: string;
};

export const JOINABLE_GROUPS: JoinableGroup[] = [
  { id: "traders-heaven", name: "Traders Heaven", members: "124,350 Members", tint: "#E6E0FF" },
  { id: "profit-secrets", name: "Profit Secrets", members: "124,350 Members", tint: "#FFE0E0" },
  { id: "money-school", name: "Money School", members: "124,350 Members", tint: "#E0FFF2" },
  { id: "nifty-markets", name: "NIFTY Markets", members: "124,350 Members", tint: "#FFF6E0" },
  { id: "traders-academy", name: "Traders Academy", members: "124,350 Members", tint: "#E0FDFF" },
];

export type DiscoverListing = JoinableGroup & {
  blurb: string;
  index: number;
};

/**
 * The Alpha discovery card — identity, a truncated blurb, an index ring and a
 * "view more" link, stacked inside one panel rather than the separate stat
 * cards used on the Investor page.
 */
export const DISCOVER_LISTINGS: DiscoverListing[] = [
  {
    id: "traders-heaven",
    name: "Traders Heaven",
    members: "124,350 Members",
    tint: "#E6E0FF",
    blurb:
      "Hello There! We’re glad to have you on board. Here’s a quick start list for you to…",
    index: 4.9,
  },
  {
    id: "profit-secrets",
    name: "Profit Secrets",
    members: "124,350 Members",
    tint: "#FFE0E0",
    blurb:
      "Hello There! We’re glad to have you on board. Here’s a quick start list for you to…",
    index: 4.9,
  },
  {
    id: "traders-academy",
    name: "Traders Academy",
    members: "124,350 Members",
    tint: "#E0FFF2",
    blurb:
      "Hello There! We’re glad to have you on board. Here’s a quick start list for you to…",
    index: 4.9,
  },
];

/** The Alpha home list reuses the investor threads — same rows, same tints. */
export const ALPHA_THREADS: ChatThread[] = CHAT_THREADS;

/**
 * The stat-card treatment of discovery. Derived from the investor fixtures so
 * the placeholder figures live in exactly one place; Alpha only renames the
 * groups, which is the whole difference between the two artboards.
 */
export const ALPHA_DISCOVERY_GROUPS: Group[] = DISCOVERY_GROUPS.map((group, i) => ({
  ...group,
  id: ["traders-heaven", "profit-secrets", "traders-academy"][i] ?? group.id,
  name: ["Traders Heaven", "Profit Secrets", "Traders Academy"][i] ?? group.name,
}));

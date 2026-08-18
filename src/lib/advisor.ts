import type { RadioCardOption } from "@/components/ui/RadioCardGroup";
import type { GroupTag } from "@/lib/groups";
import type { SignalDetail } from "@/lib/signals";
import { ALL_SIGNALS } from "@/lib/signals";

/** Signed-in advisor, as shown in the Chats hero. */
export const ADVISOR = {
  firstName: "Yash",
  initials: "YB",
  subtitle: "Here’s how you’re doing",
} as const;

/** The three headline figures on the dark performance panel. */
export const ADVISOR_STATS: ReadonlyArray<{ label: string; value: string }> = [
  { label: "Members", value: "44K" },
  { label: "Paid Users", value: "17K" },
  { label: "Revenue", value: "₹230K" },
];

/**
 * Per-signal reach, shown under each card on the advisor's All Signals list.
 * The investor build of the same card has no footer.
 */
export type SignalReach = {
  views: string;
  invested: string;
};

export const SIGNAL_REACH: SignalReach = {
  views: "13.4K Views",
  invested: "300 Invested",
};

/** Drafts tab — signals the advisor has written but not sent yet. */
export const DRAFT_SIGNALS: SignalDetail[] = ALL_SIGNALS.slice(0, 2).map((signal, index) => ({
  ...signal,
  id: `draft-${index + 1}`,
  age: "Saved 2d ago",
}));

export type Member = {
  id: string;
  name: string;
  joined: string;
  photo: string;
};

const MEMBER_NAMES = [
  "Kunal Sharma",
  "Courtney Henry",
  "Jane Cooper",
  "Dianne Russell",
  "Cody Fisher",
  "Kathryn Murphy",
  "Leslie Alexander",
  "Devon Lane",
  "Savannah Nguyen",
] as const;

/** Every row on the artboard reads "Joined April 2020"; only the face changes. */
export const MEMBERS: Member[] = MEMBER_NAMES.map((name, index) => ({
  id: name.toLowerCase().replace(/\s+/g, "-"),
  name,
  joined: "Joined April 2020",
  photo: index % 2 === 0 ? "/assets/user-avatar.png" : "/assets/user-photo.png",
}));

/** Picker options behind the readonly group fields. */
export const EXPERIENCE_OPTIONS = ["1-2 Years", "3-5 Years", "5+ Years"] as const;
export const SEGMENT_OPTIONS = ["Equity", "Futures", "Options", "Currency"] as const;
export const RISK_OPTIONS = ["Low Risk", "Medium Risk", "High Risk"] as const;
export const DURATION_OPTIONS = ["Every 1 Day", "Every 3 Days", "Every Week"] as const;

/** Values the Create Group and Edit Group Info artboards are drawn with. */
export const GROUP_DRAFT = {
  name: "Trading Bulls",
  description: "We are a group of traders that send\nsginals by",
  descriptionLimit: 280,
  experience: EXPERIENCE_OPTIONS[0],
  segment: SEGMENT_OPTIONS[0],
  risk: RISK_OPTIONS[2],
  duration: DURATION_OPTIONS[0],
  isPublic: true,
  urlPrefix: "xwealth.io/",
  handle: "tradingbulls",
} as const;

export const GROUP_TAGS: GroupTag[] = [
  { label: "NIFTY", tone: "nifty" },
  { label: "Forex", tone: "forex" },
  { label: "S&P500", tone: "sp500" },
  { label: "Intraday", tone: "neutral" },
];

/** KYC answers the Complete KYC artboard is drawn with. */
export const KYC_DRAFT = {
  sebiRegistered: "Yes",
  registrationNumber: "229388449559694",
  documentType: "PAN Card",
  panCard: "EFXB1249FB",
  firmName: "Bull Investors",
  mcaNumber: "3949429292",
} as const;

/** Tiers an advisor can charge on. Same three cards the investor subscribes to. */
export const ADVISOR_TIERS: ReadonlyArray<RadioCardOption> = [
  { id: "basic", title: "Basic", description: "₹345/mo, 10 Signals a Day" },
  { id: "pro", title: "Pro", description: "₹345/mo, 10 Signals a Day" },
  { id: "expert", title: "Expert", description: "₹345/mo, 10 Signals a Day" },
];

/** Prefilled call on the Send Signal sheet. */
export const SIGNAL_DRAFT = {
  ticker: "HDFC BANK",
  entry: "1345.46",
  exit: "354",
  startDate: "19-08-2021",
  endDate: "19-08-2021",
  targets: ["₹345", "₹345", "₹345"],
  notes:
    "This is based on a momemtum strategy your money would be invested for a\nperiod of 34 days",
} as const;

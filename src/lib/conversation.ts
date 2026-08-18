import type { SignalMessage } from "@/components/chat/SignalMessageCard";

export const WELCOME_TEXT =
  "Hello There! We're glad to have you on board. Here's a quick start list for you to get started with X Wealth App.";

export const WELCOME_TEXT_SHORT =
  "Hello There! We're glad to have you on board. Here's a quick start list for you to get";

export const SAMPLE_SIGNAL: SignalMessage = {
  side: "buy",
  symbol: "Tata Steel",
  entry: "₹345",
  exit: "₹943",
  stopLoss: "₹245",
  timeFrame: "12Jun - 1 Aug",
  risk: 2,
  targets: [
    { label: "T1", value: "₹345" },
    { label: "T2", value: "₹345" },
    { label: "T3", value: "₹345" },
  ],
  comments: 23,
};

/** Group identity used by the conversation screens. */
export const GROUP = {
  name: "Traders Heaven",
  members: "124,350 Members",
  tint: "#E6E0FF",
} as const;

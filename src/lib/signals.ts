export type SignalSide = "buy" | "sell";

export type Signal = {
  id: string;
  side: SignalSide;
  symbol: string;
  entry: string;
  exit: string;
  stopLoss: string;
};

/** Icon + tint per side. `call_received` points down-left for a buy. */
export const SIDE_STYLES = {
  buy: {
    icon: "/assets/icon-call-received.svg",
    chip: "bg-buy/[0.08]",
    text: "text-buy",
  },
  sell: {
    icon: "/assets/icon-call-made.svg",
    chip: "bg-sell/[0.08]",
    text: "text-sell",
  },
} as const;

/** A signal as shown on All Signals, with its source group and horizon. */
export type SignalDetail = Signal & {
  source: string;
  age: string;
  timeFrame: string;
};

export const ALL_SIGNALS: SignalDetail[] = [
  { id: "a1", side: "buy", symbol: "Tata Steel", entry: "₹345", exit: "₹943", stopLoss: "₹245", source: "Traders Heaven", age: "4h ago", timeFrame: "12Jun - 1 Aug" },
  { id: "a2", side: "buy", symbol: "Tata Steel", entry: "₹345", exit: "₹943", stopLoss: "₹245", source: "Traders Heaven", age: "4h ago", timeFrame: "12Jun - 1 Aug" },
  { id: "a3", side: "sell", symbol: "HDFC Bank", entry: "₹2345", exit: "₹3943", stopLoss: "₹1345", source: "Profit School", age: "4h ago", timeFrame: "12Jun - 1 Aug" },
  { id: "a4", side: "buy", symbol: "Tata Steel", entry: "₹345", exit: "₹943", stopLoss: "₹245", source: "Traders Heaven", age: "4h ago", timeFrame: "12Jun - 1 Aug" },
  { id: "a5", side: "sell", symbol: "HDFC Bank", entry: "₹2345", exit: "₹3943", stopLoss: "₹1345", source: "Profit School", age: "4h ago", timeFrame: "12Jun - 1 Aug" },
];

export const RECENT_SIGNALS: Signal[] = [
  { id: "s1", side: "buy", symbol: "Tata Steel", entry: "₹345", exit: "₹943", stopLoss: "₹245" },
  { id: "s2", side: "sell", symbol: "HDFC Bank", entry: "₹345", exit: "₹943", stopLoss: "₹245" },
  { id: "s3", side: "buy", symbol: "Tata Steel", entry: "₹345", exit: "₹943", stopLoss: "₹245" },
];

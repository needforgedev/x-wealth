export type Holding = {
  id: string;
  symbol: string;
  invested: string;
  changePercent: string;
  gain: string;
  ltp: string;
  qty: string;
  avg: string;
};

export const PORTFOLIO_SUMMARY = {
  value: "₹345,000",
  changePercent: "23%",
  invested: "₹23,943",
  pnl: "₹23,943",
  cagr: "44%",
} as const;

export const RANGES = ["1D", "1M", "6M", "12M"] as const;

export const HOLDINGS: Holding[] = [
  { id: "hdfc", symbol: "HDFC", invested: "₹435", changePercent: "23%", gain: "+8470", ltp: "LTP 234", qty: "Qty 12", avg: "Avg ₹123.45" },
  { id: "tata", symbol: "TATA", invested: "₹435", changePercent: "23%", gain: "+8470", ltp: "LTP 234", qty: "Qty 12", avg: "Avg ₹123.45" },
  { id: "bajajh", symbol: "BAJAJH", invested: "₹435", changePercent: "23%", gain: "+8470", ltp: "LTP 234", qty: "Qty 12", avg: "Avg ₹123.45" },
  { id: "jswe", symbol: "JSWE", invested: "₹435", changePercent: "23%", gain: "+8470", ltp: "LTP 234", qty: "Qty 12", avg: "Avg ₹123.45" },
  { id: "hdfc-2", symbol: "HDFC", invested: "₹435", changePercent: "23%", gain: "+8470", ltp: "LTP 234", qty: "Qty 12", avg: "Avg ₹123.45" },
];

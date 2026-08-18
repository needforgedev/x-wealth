export type ChatThread = {
  id: string;
  name: string;
  preview: string;
  time: string;
  unread?: number;
  /** Avatar circle fill — the design cycles through five pastel tints. */
  tint: string;
};

export const CHAT_THREADS: ChatThread[] = [
  {
    id: "traders-heaven",
    name: "Traders Heaven",
    preview: "Yash: This is great guys pls…",
    time: "11:23",
    unread: 12,
    tint: "#E6E0FF",
  },
  {
    id: "profit-secrets",
    name: "Profit Secrets",
    preview: "Yash: This is great guys pls…",
    time: "11:23",
    unread: 12,
    tint: "#FFE0E0",
  },
  {
    id: "money-school",
    name: "Money School",
    preview: "Yash: This is great guys pls…",
    time: "11:23",
    unread: 12,
    tint: "#E0FFF2",
  },
  {
    id: "nifty-markets",
    name: "NIFTY Markets",
    preview: "Yash: This is great guys pls…",
    time: "11:23",
    tint: "#FFF6E0",
  },
  {
    id: "booking-profits",
    name: "Booking Profits",
    preview: "Yash: This is great guys pls…",
    time: "11:23",
    tint: "#E0FDFF",
  },
  {
    id: "trading-traction",
    name: "Trading Traction",
    preview: "Yash: This is great guys pls…",
    time: "11:23",
    tint: "#E6E0FF",
  },
];

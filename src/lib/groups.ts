/** Category tag tints, taken from the group card in Figma. */
export const TAG_TONES = {
  nifty: "bg-[#eff2ff]",
  forex: "bg-[#fff9ef]",
  sp500: "bg-[#f6ffef]",
  neutral: "bg-[#ececec]",
} as const;

export type TagTone = keyof typeof TAG_TONES;

export type GroupTag = {
  label: string;
  tone: TagTone;
};

export type Group = {
  id: string;
  name: string;
  members: string;
  verified: boolean;
  /** Avatar circle fill — each group gets its own tint in the design. */
  tint: string;
  aum: string;
  aumDelta: string;
  accuracy: string;
  calls: string;
  indexLabel: string;
  rating: number;
  tags: GroupTag[];
};

const STANDARD_TAGS: GroupTag[] = [
  { label: "NIFTY", tone: "nifty" },
  { label: "Forex", tone: "forex" },
  { label: "S&P500", tone: "sp500" },
];

/** Cards shown on Group Discovery — the artboard repeats the same group three times. */
export const DISCOVERY_GROUPS: Group[] = [
  {
    id: "traders-heaven-1",
    name: "Traders Heaven",
    members: "123,394 Members",
    verified: true,
    tint: "#E6E0FF",
    aum: "345%",
    aumDelta: "23%",
    accuracy: "94%",
    calls: "1020/Day",
    indexLabel: "Index",
    rating: 4.9,
    tags: [
      { label: "NIFTY", tone: "nifty" },
      { label: "Forex", tone: "forex" },
      { label: "S&P500", tone: "sp500" },
    ],
  },
  {
    id: "traders-heaven-2",
    name: "Traders Heaven",
    members: "123,394 Members",
    verified: true,
    tint: "#E6E0FF",
    aum: "345%",
    aumDelta: "23%",
    accuracy: "94%",
    calls: "1020/Day",
    indexLabel: "Index",
    rating: 4.9,
    tags: [
      { label: "NIFTY", tone: "nifty" },
      { label: "Forex", tone: "forex" },
      { label: "S&P500", tone: "sp500" },
    ],
  },
  {
    id: "traders-heaven-3",
    name: "Traders Heaven",
    members: "123,394 Members",
    verified: true,
    tint: "#E6E0FF",
    aum: "345%",
    aumDelta: "23%",
    accuracy: "94%",
    calls: "1020/Day",
    indexLabel: "Index",
    rating: 4.9,
    tags: [
      { label: "NIFTY", tone: "nifty" },
      { label: "Forex", tone: "forex" },
      { label: "S&P500", tone: "sp500" },
    ],
  },
];

export const INVITED_GROUPS: Group[] = [
  {
    id: "traders-heaven",
    name: "Traders Heaven",
    members: "123,394 Members",
    verified: true,
    tint: "#E6E0FF",
    aum: "345%",
    aumDelta: "23%",
    accuracy: "94%",
    calls: "1020/Day",
    indexLabel: "Index",
    rating: 4.9,
    tags: STANDARD_TAGS,
  },
  {
    id: "profit-secrets",
    name: "Profit Secrets",
    members: "123,394 Members",
    verified: false,
    tint: "#E0FFFB",
    aum: "345%",
    aumDelta: "23%",
    accuracy: "94%",
    calls: "1020/Day",
    indexLabel: "Index",
    rating: 4.9,
    tags: STANDARD_TAGS,
  },
];

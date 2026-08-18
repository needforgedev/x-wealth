export const USER = {
  name: "Raj Bansal",
  since: "Member since 2021",
  email: "rajbansal@gmail.com",
  bio: "Hello There! We're glad to have you on board. Here's a quick start list for you to get started",
} as const;

export type SettingsItem = {
  href: string;
  label: string;
  icon: { src: string; width: number; height: number };
};

export const SETTINGS: ReadonlyArray<SettingsItem> = [
  {
    href: "/profile/edit",
    label: "Account Details",
    icon: { src: "/assets/icon-person.svg", width: 24, height: 24 },
  },
  {
    href: "/profile/password",
    label: "Change Password",
    icon: { src: "/assets/icon-lock.svg", width: 24, height: 24 },
  },
  {
    href: "/profile/favourites",
    label: "Get Support",
    icon: { src: "/assets/icon-live-help.svg", width: 24, height: 24 },
  },
];

export type FavouriteStock = {
  id: string;
  ticker: string;
  name: string;
  price: string;
  change: string;
  direction: "up" | "down";
  logo: string;
  logoWidth: number;
  logoHeight: number;
};

export const FAVOURITE_STOCKS: FavouriteStock[] = [
  { id: "tata", ticker: "TATA", name: "Tata Steel", price: "$234.00", change: "124%", direction: "up", logo: "/assets/logo-tata.png", logoWidth: 31, logoHeight: 19 },
  { id: "paytm", ticker: "PAYTM", name: "PayTM", price: "$234.00", change: "124%", direction: "up", logo: "/assets/logo-paytm.png", logoWidth: 33, logoHeight: 25 },
  { id: "nyka", ticker: "NYKA", name: "NYKAA", price: "$234.00", change: "124%", direction: "up", logo: "/assets/logo-nykaa.png", logoWidth: 34, logoHeight: 11 },
  { id: "tcs", ticker: "TCS", name: "Netflix", price: "$234.00", change: "124%", direction: "down", logo: "/assets/logo-netflix.png", logoWidth: 24, logoHeight: 22 },
  { id: "info", ticker: "INFO", name: "Twitter", price: "$234.00", change: "124%", direction: "up", logo: "/assets/logo-twitter.png", logoWidth: 18, logoHeight: 18 },
];

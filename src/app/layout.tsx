import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, Inter, Roboto } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// The account switcher sheet is specified in Roboto rather than Inter.
const roboto = Roboto({
  variable: "--font-roboto",
  weight: ["500", "600"],
  subsets: ["latin"],
});

// Edit Profile and Change Password are specified in IBM Plex Sans.
const plex = IBM_Plex_Sans({
  variable: "--font-plex",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "X Wealth",
  /**
   * This is what a search result and a link preview show, which is why the old
   * line — "Quality trading signals from certified experts" — survived the
   * whole persona migration unnoticed: it renders nowhere in the app. It
   * described a product `CLAUDE.md` §2 abandoned and made a claim §8.7
   * forbids. Caught by `xwealth/no-performance-claims`, which exists because
   * nothing else in CI can read prose.
   */
  description:
    "Describe a trading idea in plain English, test it against history net of Indian costs, " +
    "then forward-test it on paper before it sees real money.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${roboto.variable} ${plex.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}

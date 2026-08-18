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
  description: "Quality trading signals from certified experts and professionals.",
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

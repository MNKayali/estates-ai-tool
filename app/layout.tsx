import type { Metadata } from "next";
import { Playfair_Display, DM_Sans, DM_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";
import { BRAND } from "@/lib/brand";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const DESCRIPTION =
  "RIBA Stage 0–1 feasibility reports in minutes: an NRM1 order-of-cost estimate, RIBA programme and risk register, with every figure calculated from benchmark data.";

// No openGraph url or image yet: both need metadataBase, which waits for
// BRAND.siteUrl. The tab icons come from app/icon.svg, app/apple-icon.png and
// app/favicon.ico (Next file conventions), so they need no entry here.
export const metadata: Metadata = {
  title: `${BRAND.name} — RIBA Stage 0–1 Feasibility Reports`,
  description: DESCRIPTION,
  applicationName: BRAND.name,
  openGraph: {
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: DESCRIPTION,
    siteName: BRAND.name,
    type: "website",
    locale: "en_GB",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${playfair.variable} ${dmSans.variable} ${dmMono.variable}`}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}

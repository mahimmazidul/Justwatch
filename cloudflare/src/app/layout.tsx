import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import "./globals.css";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { readMarket } from "@/lib/anon";
import { DEFAULT_MARKET } from "@/lib/justwatch";

/* Self-hosted fonts — no build-time network dependency. */
const grotesk = localFont({
  src: "../assets/fonts/space-grotesk-normal-300-700-latin.woff2",
  variable: "--font-grotesk",
  weight: "300 700",
  display: "swap",
});

const instrument = localFont({
  src: [
    { path: "../assets/fonts/instrument-serif-normal-400-latin.woff2", weight: "400", style: "normal" },
    { path: "../assets/fonts/instrument-serif-italic-400-latin.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-instrument",
  display: "swap",
});

const plexMono = localFont({
  src: [
    { path: "../assets/fonts/ibm-plex-mono-normal-400-latin.woff2", weight: "400", style: "normal" },
    { path: "../assets/fonts/ibm-plex-mono-normal-500-latin.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-mono-ibm",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#f4f1ea",
};

export const metadata: Metadata = {
  title: {
    default: "JustWatch Search — Find where to watch anything, anywhere",
    template: "%s · JustWatch Search",
  },
  description:
    "Search any film or series and see every streaming, rental and purchase offer across 54 countries, with prices normalised to USD. Data via the JustWatch API.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const market = (await readMarket()) ?? DEFAULT_MARKET;
  return (
    <html lang="en" className={`${grotesk.variable} ${instrument.variable} ${plexMono.variable}`}>
      <body className="grain min-h-dvh bg-[var(--color-bg)] text-[var(--color-ink)] antialiased">
        <SiteHeader market={market} />
        <main className="relative">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}

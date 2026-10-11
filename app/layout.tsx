import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Public_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { LiveRegionProvider } from "@/components/live-region/LiveRegion";
import { themeInitScript } from "@/components/theme/theme";
import "./globals.css";

const publicSans = Public_Sans({ subsets: ["latin"], variable: "--font-public-sans", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Salin", template: "%s · Salin" },
  description: "Know what's left. Give every peso of income a job.",
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f8f7" },
    { media: "(prefers-color-scheme: dark)", color: "#10181a" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${publicSans.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <LiveRegionProvider>{children}</LiveRegionProvider>
      </body>
    </html>
  );
}

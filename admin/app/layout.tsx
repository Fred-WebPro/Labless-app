import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Caveat, JetBrains_Mono, Onest } from "next/font/google";
import "./globals.css";

const onest = Onest({ subsets: ["latin", "cyrillic"], variable: "--font-onest", display: "swap" });
const jet = JetBrains_Mono({ subsets: ["latin", "cyrillic"], weight: ["400", "500"], variable: "--font-jet", display: "swap" });
const caveat = Caveat({ subsets: ["latin", "cyrillic"], weight: ["700"], variable: "--font-caveat", display: "swap" });

export const metadata: Metadata = {
  title: "Labless Admin",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={`${onest.variable} ${jet.variable} ${caveat.variable}`}>
      <body>{children}</body>
    </html>
  );
}

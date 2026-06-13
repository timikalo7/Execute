import { Fraunces, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";

// Display — Fraunces, used light (300) at large sizes, with optical sizing.
// High-contrast editorial serif. Distinctive, not a default sans.
export const fontDisplay = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
});

// Body — Hanken Grotesk. Clean grotesk, deliberately not Inter.
export const fontSans = Hanken_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

// Mono — JetBrains Mono for eyebrows, labels, metrics, the "OS" voice.
export const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
  weight: ["400", "500"],
});

export const fontVars = `${fontDisplay.variable} ${fontSans.variable} ${fontMono.variable}`;

import type { Metadata } from "next";
import "./globals.css";
import { fontVars } from "@/lib/fonts";
import { AuthProvider } from "@/lib/auth";
import { StoreProvider } from "@/lib/store";

export const metadata: Metadata = {
  title: "LifeOS — the operating system for a deliberate life",
  description:
    "Turn your identity, values, and goals into a daily plan you actually execute. LifeOS is a reasoning engine for better decisions and consistent action.",
  openGraph: {
    title: "LifeOS — the operating system for a deliberate life",
    description:
      "Identity → values → goals → systems → today's plan. The reasoning engine for consistent execution.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={fontVars}>
      <body>
        <AuthProvider>
          <StoreProvider>{children}</StoreProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

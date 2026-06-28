import type { Metadata } from "next";
import { cookies } from "next/headers";
import {
  Libre_Caslon_Display,
  Libre_Caslon_Text,
  Newsreader,
  Space_Mono,
} from "next/font/google";
import "./globals.css";

const display = Libre_Caslon_Display({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400"],
});

const text = Libre_Caslon_Text({
  subsets: ["latin"],
  variable: "--font-text",
  weight: ["400", "700"],
});

const serif = Newsreader({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["400", "500"],
  style: ["normal", "italic"],
});

const mono = Space_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Signal: the daily AI briefing",
  description:
    "Daily AI updates, obscure new tools, and the most interesting AI reads, curated to your taste.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const theme =
    (await cookies()).get("sig_theme")?.value === "dark" ? "dark" : "light";
  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${display.variable} ${text.variable} ${serif.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}

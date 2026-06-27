import type { Metadata } from "next";
import { Space_Grotesk, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const sans = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

const serif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: "Signal: AI, curated to your taste",
  description:
    "Daily AI updates, obscure new tools, and the most interesting AI reads, personalized.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${serif.variable}`}>
        <div className="h-1 w-full bg-[#cdff3a]" />
        {children}
      </body>
    </html>
  );
}

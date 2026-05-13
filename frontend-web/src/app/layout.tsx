import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300","400","500","600","700","800","900"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "velmoraa",
  description: "velmoraa social app",
};

import Sidebar from "@/components/Sidebar";
import Providers from "@/components/Providers";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex font-sans" style={{background:'var(--bg)',color:'var(--ink-900)'}} suppressHydrationWarning>        <Providers>
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 pb-20 md:pb-0">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}

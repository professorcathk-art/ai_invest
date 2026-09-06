import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/components/i18n/provider";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "InvestMouse | 多維度 VC/PE 智能估值與投委會模擬平台",
  description:
    "融合硬核財務模型（DCF / LBO / VC Units）與四位傳奇投資人 AI 審查邏輯，透視任何上市企業的真實價值。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${jetbrains.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <I18nProvider>
            <TooltipProvider>
              {children}
              <Toaster />
            </TooltipProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

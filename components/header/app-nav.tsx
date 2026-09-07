"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { useI18n } from "@/components/i18n/provider";
import { RecentTickers } from "./recent-tickers";

const LINKS = [
  { href: "/", key: "navHome" as const },
  { href: "/industry-research", key: "navIndustry" as const },
  { href: "/private-market", key: "navPrivate" as const },
];

export function AppNav() {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className="border-border/80 bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-2 px-3 py-2.5 sm:px-4 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <Link href="/" className="text-bull text-[11px] tracking-[0.22em] uppercase">
              {t("brand")}
            </Link>
            <div className="flex flex-wrap items-center gap-1">
              {LINKS.map((link) => {
                const active = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`rounded-md px-2.5 py-1 text-xs ${
                      active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t(link.key)}
                  </Link>
                );
              })}
            </div>
          </div>
          <LanguageToggle />
        </div>
        <RecentTickers
          onSelect={(symbol) => {
            router.push(`/?t=${encodeURIComponent(symbol)}`);
          }}
        />
      </div>
    </nav>
  );
}

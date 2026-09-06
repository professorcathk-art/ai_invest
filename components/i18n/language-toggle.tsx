"use client";

import { Button } from "@/components/ui/button";
import { useI18n } from "./provider";

export function LanguageToggle() {
  const { locale, setLocale } = useI18n();
  return (
    <div className="border-border inline-flex rounded-lg border p-0.5 text-xs">
      <Button
        type="button"
        size="xs"
        variant={locale === "en" ? "default" : "ghost"}
        onClick={() => setLocale("en")}
      >
        EN
      </Button>
      <Button
        type="button"
        size="xs"
        variant={locale === "zh" ? "default" : "ghost"}
        onClick={() => setLocale("zh")}
      >
        繁中
      </Button>
    </div>
  );
}

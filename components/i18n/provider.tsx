"use client";

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { messages, type Locale, type MessageKey } from "@/lib/i18n/messages";

const STORAGE_KEY = "personaval-locale";
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readLocale(): Locale {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === "zh" || saved === "en" ? saved : "en";
}

function writeLocale(next: Locale) {
  window.localStorage.setItem(STORAGE_KEY, next);
  document.documentElement.lang = next === "zh" ? "zh-Hant" : "en";
  emit();
}

const I18nContext = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey) => string;
} | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribe, readLocale, () => "en" as const);

  const value = useMemo(
    () => ({
      locale,
      setLocale: writeLocale,
      t: (key: MessageKey) => messages[locale][key],
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

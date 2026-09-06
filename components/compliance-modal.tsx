"use client";

import { useMemo, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/components/i18n/provider";

const STORAGE_KEY = "investmouse-compliance-v1";
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

function readAccepted(): boolean {
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

function acceptTerms() {
  window.localStorage.setItem(STORAGE_KEY, "1");
  emit();
}

export function useComplianceAccepted() {
  return useSyncExternalStore(subscribe, readAccepted, () => false);
}

export function ComplianceModal() {
  const { t } = useI18n();
  const accepted = useComplianceAccepted();
  const open = !accepted;

  return (
    <Dialog
      open={open}
      onOpenChange={() => {
        // Cannot dismiss without accepting.
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-lg"
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t("legalTitle")}</DialogTitle>
          <DialogDescription className="text-pretty whitespace-pre-line leading-relaxed">
            {t("legalBody")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" onClick={acceptTerms}>
            {t("legalAgree")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DisclaimerFooter() {
  const { t } = useI18n();
  const label = useMemo(() => t("legalFooter"), [t]);
  return (
    <footer className="border-border bg-background/90 text-muted-foreground sticky bottom-0 z-40 border-t px-4 py-2 text-center text-[11px] leading-relaxed backdrop-blur-sm">
      {label}
    </footer>
  );
}

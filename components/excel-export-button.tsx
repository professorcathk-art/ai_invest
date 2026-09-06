"use client";

import { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { CompanyFinancials, SliderAssumptions } from "@/lib/engines/types";
import { useI18n } from "@/components/i18n/provider";

export function ExcelExportButton({
  financials,
  sliders,
}: {
  financials: CompanyFinancials;
  sliders: SliderAssumptions;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const res = await fetch("/api/excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ financials, sliders }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `InvestMouse_${financials.quote.ticker}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Excel export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="outline"
      onClick={download}
      disabled={busy}
      className="border-bull text-bull hover:bg-bull/10"
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
      {t("exportExcel")}
    </Button>
  );
}

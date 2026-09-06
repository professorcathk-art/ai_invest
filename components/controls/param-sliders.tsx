"use client";

import { Slider } from "@/components/ui/slider";
import { SLIDER_BOUNDS, type SliderAssumptions } from "@/lib/engines/types";
import { formatMultiple, formatPct } from "@/lib/format";
import { useI18n } from "@/components/i18n/provider";
import type { MessageKey } from "@/lib/i18n/messages";

const FIELDS: Array<{
  key: keyof SliderAssumptions;
  labelKey: MessageKey;
  format: (v: number) => string;
}> = [
  { key: "wacc", labelKey: "wacc", format: (v) => formatPct(v) },
  { key: "terminalGrowth", labelKey: "terminalGrowth", format: (v) => formatPct(v) },
  { key: "exitMultiple", labelKey: "exitMultiple", format: (v) => formatMultiple(v) },
  { key: "debtPct", labelKey: "debtPct", format: (v) => formatPct(v, 0) },
];

export function ParamSliders({
  value,
  onChange,
}: {
  value: SliderAssumptions;
  onChange: (next: SliderAssumptions) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="border-border bg-card space-y-4 rounded-xl border p-5">
      <div>
        <p className="text-sm font-medium">{t("assumeTitle")}</p>
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{t("assumeHint")}</p>
      </div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {FIELDS.map((field) => {
          const bounds = SLIDER_BOUNDS[field.key];
          return (
            <label key={field.key} className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-muted-foreground text-xs tracking-wide">{t(field.labelKey)}</span>
                <span className="font-financial text-bull text-sm">{field.format(value[field.key])}</span>
              </div>
              <Slider
                min={bounds.min}
                max={bounds.max}
                step={bounds.step}
                value={[value[field.key]]}
                onValueChange={([next]) =>
                  onChange({ ...value, [field.key]: next ?? value[field.key] })
                }
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}

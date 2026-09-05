"use client";

import { Slider } from "@/components/ui/slider";
import { SLIDER_BOUNDS, type SliderAssumptions } from "@/lib/engines/types";
import { formatMultiple, formatPct } from "@/lib/format";

const FIELDS: Array<{
  key: keyof SliderAssumptions;
  label: string;
  format: (v: number) => string;
}> = [
  { key: "wacc", label: "WACC", format: (v) => formatPct(v) },
  { key: "terminalGrowth", label: "Terminal growth", format: (v) => formatPct(v) },
  { key: "exitMultiple", label: "LBO exit multiple", format: (v) => formatMultiple(v) },
  { key: "debtPct", label: "Debt %", format: (v) => formatPct(v, 0) },
];

export function ParamSliders({
  value,
  onChange,
}: {
  value: SliderAssumptions;
  onChange: (next: SliderAssumptions) => void;
}) {
  return (
    <div className="border-border bg-card grid gap-5 rounded-xl border p-5 md:grid-cols-2 xl:grid-cols-4">
      {FIELDS.map((field) => {
        const bounds = SLIDER_BOUNDS[field.key];
        return (
          <label key={field.key} className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground text-xs tracking-wide uppercase">
                {field.label}
              </span>
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
  );
}

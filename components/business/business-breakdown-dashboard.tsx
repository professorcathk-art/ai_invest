"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/provider";
import type { BusinessBreakdown } from "@/lib/data/segments";

const COLORS = ["#22c55e", "#38bdf8", "#f59e0b", "#f43f5e", "#a78bfa", "#14b8a6", "#fb7185", "#94a3b8"];

function shareLabel(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

export function BusinessBreakdownDashboard({
  breakdown,
}: {
  breakdown: BusinessBreakdown | null;
}) {
  const { t } = useI18n();
  const products = breakdown?.products ?? [];
  const geos = breakdown?.geos ?? [];
  const cards = breakdown?.productCards ?? [];
  const roadmap = breakdown?.roadmap ?? [];
  const empty = !products.length && !geos.length && !cards.length && !roadmap.length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">{t("businessTitle")}</h2>
        {breakdown?.period ? (
          <p className="text-muted-foreground font-financial text-xs">{breakdown.period}</p>
        ) : null}
      </div>

      {empty ? (
        <Card className="border-dashed">
          <CardContent className="space-y-2 px-6 py-10 text-center">
            <p className="font-medium">{t("businessEmpty")}</p>
            <p className="text-muted-foreground text-sm">{t("businessEmptyHint")}</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("businessSegments")}</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {products.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={products.map((s) => ({ name: s.name, value: s.share }))}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={48}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {products.map((s, i) => (
                      <Cell key={s.name} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => shareLabel(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-sm">{t("businessEmpty")}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("businessGeo")}</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {geos.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={geos.map((s) => ({ name: s.name, share: s.share * 100 }))}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                  <YAxis tick={{ fontSize: 11 }} unit="%" />
                  <Tooltip formatter={(value) => `${Number(value).toFixed(1)}%`} />
                  <Bar dataKey="share" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-sm">{t("businessEmpty")}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {cards.length ? (
        <div>
          <h3 className="mb-2 text-sm font-medium">{t("businessProducts")}</h3>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <Card key={card.name}>
                <CardHeader>
                  <CardTitle className="text-sm">{card.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm leading-relaxed">{card.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {roadmap.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("businessRoadmap")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="border-border relative space-y-4 border-l pl-4">
              {roadmap.map((item) => (
                <li key={item.url || item.title} className="text-sm">
                  <div className="bg-bull absolute -left-1.5 mt-1.5 size-2.5 rounded-full" />
                  <p className="leading-relaxed">{item.title}</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {item.source}
                    {item.publishedAt ? ` · ${item.publishedAt.slice(0, 10)}` : ""}
                    {item.url ? (
                      <>
                        {" · "}
                        <a href={item.url} target="_blank" rel="noreferrer" className="text-tech underline">
                          {item.source}
                        </a>
                      </>
                    ) : null}
                  </p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

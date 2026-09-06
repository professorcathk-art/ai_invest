"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CompanyContext } from "@/lib/data/context";
import { HIGHLIGHT_I18N, type MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/provider";

export function CompanyContextPanel({ context }: { context: CompanyContext }) {
  const { t } = useI18n();
  const hasBody = Boolean(
    context.businessSummary || context.news.length || context.highlights?.length || context.references?.length,
  );
  if (!hasBody) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {context.businessSummary || context.highlights?.length ? (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm">{t("overview")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {context.highlights?.length ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {context.highlights.map((item) => (
                  <div key={`${item.label}-${item.value}`}>
                    <dt className="text-muted-foreground text-[10px] tracking-[0.12em] uppercase">
                      {HIGHLIGHT_I18N[item.label] ? t(HIGHLIGHT_I18N[item.label] as MessageKey) : item.label}
                    </dt>
                    <dd className="truncate">{item.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {context.businessSummary ? (
              <p className="text-muted-foreground text-sm leading-relaxed">
                {context.businessSummary}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      {context.news.length || context.references?.length ? (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm">{t("headlines")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {context.news.length ? (
              <ul className="space-y-2">
                {context.news.map((item) => (
                  <li key={`${item.title}-${item.publishedAt}`}>
                    {item.url ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-tech hover:underline"
                      >
                        {item.title}
                      </a>
                    ) : (
                      <span className="text-sm">{item.title}</span>
                    )}
                    <div className="text-muted-foreground text-xs">{item.publisher}</div>
                  </li>
                ))}
              </ul>
            ) : null}
            {context.references?.length ? (
              <div>
                <div className="text-muted-foreground mb-2 text-[10px] tracking-[0.14em] uppercase">
                  {t("filings")}
                </div>
                <ul className="space-y-1.5">
                  {context.references.slice(0, 5).map((ref) => (
                    <li key={ref.url}>
                      <a
                        href={ref.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-tech hover:underline"
                      >
                        {ref.title}
                      </a>
                      <div className="text-muted-foreground text-xs">{ref.source}</div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export function ReferencesPanel({ context }: { context: CompanyContext }) {
  const { t } = useI18n();
  if (!context.references?.length && !context.news.length) return null;
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-sm">{t("references")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="text-muted-foreground list-decimal space-y-1.5 pl-5 text-sm">
          {context.references.map((ref) => (
            <li key={ref.url} className="break-words">
              <a href={ref.url} target="_blank" rel="noreferrer" className="text-tech hover:underline">
                {ref.title}
              </a>
              <span> — {ref.source}</span>
            </li>
          ))}
          {context.news
            .filter((item) => item.url)
            .map((item) => (
              <li key={item.url} className="break-words">
                <a href={item.url} target="_blank" rel="noreferrer" className="text-tech hover:underline">
                  {item.title}
                </a>
                <span> — {item.publisher}</span>
              </li>
            ))}
        </ol>
      </CardContent>
    </Card>
  );
}

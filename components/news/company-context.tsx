"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CompanyContext } from "@/lib/data/context";

export function CompanyContextPanel({ context }: { context: CompanyContext }) {
  const hasBody = Boolean(
    context.businessSummary || context.news.length || context.highlights?.length,
  );
  if (!hasBody) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {context.businessSummary || context.highlights?.length ? (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm">Business overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {context.highlights?.length ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {context.highlights.map((item) => (
                  <div key={`${item.label}-${item.value}`}>
                    <dt className="text-muted-foreground text-[10px] tracking-[0.12em] uppercase">
                      {item.label}
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
      {context.news.length ? (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm">Recent headlines</CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

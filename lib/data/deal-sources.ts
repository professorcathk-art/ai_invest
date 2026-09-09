export interface DealSource {
  label: string;
  url: string;
}

const HOST_LABELS: Array<[RegExp, string]> = [
  [/bloomberg\./i, "Bloomberg"],
  [/cnbc\./i, "CNBC"],
  [/reuters\./i, "Reuters"],
  [/yahoo\./i, "Yahoo"],
  [/techcrunch\./i, "TechCrunch"],
  [/crunchbase\./i, "Crunchbase"],
  [/scmp\./i, "SCMP"],
  [/ft\.com|financialtimes/i, "FT"],
  [/wsj\./i, "WSJ"],
  [/bbc\./i, "BBC"],
  [/a16z\.|andreessen/i, "a16z"],
  [/ycombinator\.|y combinator/i, "Y Combinator"],
  [/sequoiacap\.|sequoia/i, "Sequoia"],
  [/google\./i, "Google News"],
  [/sec\.gov/i, "SEC"],
];

export function sourceLabel(url: string, publisher = "", title = ""): string {
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  for (const [pattern, label] of HOST_LABELS) {
    if (pattern.test(host) && !/google\./i.test(host)) return label;
    if (pattern.test(url) && !/news\.google\./i.test(url)) return label;
  }
  const fromTitle = `${title} ${publisher}`.match(
    /\b(Bloomberg|CNBC|Reuters|Yahoo|TechCrunch|Crunchbase|SCMP|BBC|FT|WSJ)\b/i,
  );
  if (fromTitle) {
    const name = fromTitle[1]!;
    return name === "Ft" ? "FT" : name[0]!.toUpperCase() + name.slice(1);
  }
  const pub = publisher.trim();
  if (pub && !/^google news$/i.test(pub)) return pub.length > 18 ? pub.slice(0, 16) : pub;
  return "Wire";
}

export function mergeSources(rows: Array<DealSource | null | undefined>): DealSource[] {
  const seen = new Set<string>();
  const out: DealSource[] = [];
  for (const row of rows) {
    if (!row?.url) continue;
    const key = row.url.replace(/\/+$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label: row.label || sourceLabel(row.url), url: row.url });
  }
  return out.slice(0, 8);
}

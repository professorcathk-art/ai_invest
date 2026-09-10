export interface RssItem {
  title: string;
  publisher: string;
  url: string;
  publishedAt: string | null;
  summary?: string;
}

function stripHtml(value: string): string {
  return decodeXml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export async function parseRss(url: string, publisher: string, limit = 12): Promise<RssItem[]> {
  try {
    const res = await fetch(url, {
      next: { revalidate: 300 },
      headers: { "User-Agent": "InvestMouse/1.0 (research; +https://investmouse.app)" },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items: RssItem[] = [];
    const blocks = xml.split(/<item[\s>]/i).slice(1);
    for (const block of blocks) {
      const title = decodeXml(block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1] ?? "");
      const link = decodeXml(
        block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ??
          block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i)?.[1] ??
          "",
      );
      const pub = decodeXml(block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? "");
      const summary = stripHtml(block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)?.[1] ?? "");
      if (!title) continue;
      items.push({
        title,
        publisher,
        url: link.trim(),
        publishedAt: pub ? new Date(pub).toISOString() : null,
        summary: summary.slice(0, 800),
      });
    }
    return items.slice(0, limit);
  } catch {
    return [];
  }
}

export function googleNewsUrl(query: string, locale: "en" | "zh"): string {
  const hl = locale === "zh" ? "zh-HK" : "en-US";
  const gl = locale === "zh" ? "HK" : "US";
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${hl}&gl=${gl}&ceid=${gl}:${hl}`;
}

export async function uniqueRss(packs: RssItem[][], limit = 16): Promise<RssItem[]> {
  const seen = new Set<string>();
  const out: RssItem[] = [];
  for (const pack of packs) {
    for (const item of pack) {
      const key = item.title.toLowerCase();
      if (!item.title || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  out.sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
  return out.slice(0, limit);
}

export async function fetchPageSnippet(url: string): Promise<string> {
  if (!url || /news\.google\.com/i.test(url)) return "";
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(3000),
      headers: { "User-Agent": "InvestMouse/1.0 (research; +https://investmouse.app)" },
    });
    if (!res.ok) return "";
    const html = await res.text();
    return stripHtml(html).slice(0, 800);
  } catch {
    return "";
  }
}

export async function enrichRssSnippets(items: RssItem[], limit = 6): Promise<RssItem[]> {
  const need = items.filter((item) => !item.summary && item.url && !/news\.google\.com/i.test(item.url)).slice(0, limit);
  const snippets = await Promise.all(need.map(async (item) => [item.url, await fetchPageSnippet(item.url)] as const));
  const byUrl = new Map(snippets);
  return items.map((item) => ({ ...item, summary: item.summary || byUrl.get(item.url) || "" }));
}

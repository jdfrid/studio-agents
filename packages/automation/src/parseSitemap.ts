const LOC_RE = /<loc>\s*([^<]+)\s*<\/loc>/gi;

export function parseSitemapLocs(xml: string, baseUrl: string): { pages: string[]; nestedSitemaps: string[] } {
  if (/<html[\s>]|<!doctype html/i.test(xml) && !/<urlset|<sitemapindex/i.test(xml)) {
    return { pages: [], nestedSitemaps: [] };
  }
  const pages: string[] = [];
  const nestedSitemaps: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  const locRe = new RegExp(LOC_RE.source, "gi");
  while ((match = locRe.exec(xml))) {
    const raw = decodeXml(match[1]?.trim() ?? "");
    if (!raw) continue;
    let href: string;
    try {
      href = new URL(raw, baseUrl).toString();
    } catch {
      continue;
    }
    if (seen.has(href)) continue;
    seen.add(href);
    if (/\.xml($|\?)/i.test(href) || /sitemap/i.test(href)) nestedSitemaps.push(href);
    else pages.push(href);
  }
  return { pages, nestedSitemaps };
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

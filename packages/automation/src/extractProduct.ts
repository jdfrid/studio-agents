import { absoluteUrl, canonicalKey, type DiscoveredProduct } from "./fetchPage.js";

const SKIP_PATH =
  /\/(cart|checkout|login|signin|account|privacy|terms|wp-admin|wp-login|search|tag\/|category\/|author\/)/i;
const SKIP_EXT = /\.(pdf|jpe?g|png|gif|webp|svg|mp4|zip|css|js)(\?|$)/i;
const PRODUCT_HINT =
  /\/(product|products|item|items|p|shop|store|room|rooms|suite|suites|package|packages|deal|deals|offer|offers|tour|tours|hotel|hotels|collection)s?(\/|$)/i;

export function looksLikeProductUrl(url: string, siteOrigin: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== siteOrigin) return false;
    if (SKIP_EXT.test(parsed.pathname)) return false;
    if (SKIP_PATH.test(parsed.pathname)) return false;
    if (parsed.pathname === "/" || parsed.pathname === "") return false;
    return PRODUCT_HINT.test(parsed.pathname) || Boolean(parsed.searchParams.get("product") || parsed.searchParams.get("id"));
  } catch {
    return false;
  }
}

export function extractProduct(html: string, pageUrl: string): DiscoveredProduct | null {
  const jsonLd = extractJsonLdProducts(html, pageUrl);
  const og = extractOpenGraph(html, pageUrl);
  const title = jsonLd?.title || og.title || extractHtmlTitle(html);
  if (!title) return null;
  const canonicalUrl = canonicalKey(jsonLd?.canonicalUrl || og.url || pageUrl);
  const imageUrls = unique([...(jsonLd?.imageUrls ?? []), ...(og.image ? [og.image] : [])]).slice(0, 6);
  if (!imageUrls.length && !jsonLd?.priceText && !og.title) {
    // Homepage-like pages without a product signal.
    if (!looksLikeProductUrl(pageUrl, new URL(pageUrl).origin)) return null;
  }
  return {
    canonicalUrl,
    title: title.slice(0, 180),
    priceText: jsonLd?.priceText || og.price || undefined,
    description: (jsonLd?.description || og.description || "").slice(0, 1500) || undefined,
    imageUrls
  };
}

export function extractLinks(html: string, pageUrl: string): string[] {
  const hrefs: string[] = [];
  const re = /<a\s[^>]*href=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const abs = absoluteUrl(decodeHtml(match[1] ?? ""), pageUrl);
    if (abs) hrefs.push(abs);
  }
  return hrefs;
}

function extractHtmlTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const text = decodeHtml(match?.[1]?.trim() ?? "");
  return text || undefined;
}

function extractOpenGraph(html: string, pageUrl: string): {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  price?: string;
} {
  const attr = (property: string) => {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
      "i"
    );
    const alt = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
      "i"
    );
    return decodeHtml(html.match(re)?.[1] ?? html.match(alt)?.[1] ?? "");
  };
  const imageRaw = attr("og:image") || attr("og:image:url");
  const urlRaw = attr("og:url") || attr("canonical");
  const amount = attr("product:price:amount") || attr("og:price:amount");
  const currency = attr("product:price:currency") || attr("og:price:currency");
  return {
    title: attr("og:title") || undefined,
    description: attr("og:description") || undefined,
    image: imageRaw ? absoluteUrl(imageRaw, pageUrl) ?? undefined : undefined,
    url: urlRaw ? absoluteUrl(urlRaw, pageUrl) ?? undefined : undefined,
    price: amount ? [amount, currency].filter(Boolean).join(" ") : undefined
  };
}

function extractJsonLdProducts(html: string, pageUrl: string): DiscoveredProduct | null {
  const scripts = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const block of scripts) {
    const jsonText = block.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "");
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      continue;
    }
    const nodes = flattenJsonLd(parsed);
    for (const node of nodes) {
      const types = asTypes(node);
      if (types.includes("product") || types.includes("hotelroom") || types.includes("offer")) {
        const name = str(node.name) || str(node.headline);
        if (!name) continue;
        const images = collectImages(node.image, pageUrl);
        const offer = firstObject(node.offers);
        const price = offer
          ? [str(offer.price) || str(offer.lowPrice), str(offer.priceCurrency)].filter(Boolean).join(" ")
          : undefined;
        const url = str(node.url) ? absoluteUrl(str(node.url)!, pageUrl) ?? pageUrl : pageUrl;
        return {
          canonicalUrl: canonicalKey(url),
          title: name,
          priceText: price || undefined,
          description: str(node.description) || undefined,
          imageUrls: images
        };
      }
    }
  }
  return null;
}

function flattenJsonLd(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.flatMap((item) => flattenJsonLd(item));
  if (!value || typeof value !== "object") return [];
  const rec = value as Record<string, unknown>;
  const graph = rec["@graph"];
  if (Array.isArray(graph)) return graph.flatMap((item) => flattenJsonLd(item));
  return [rec];
}

function asTypes(node: Record<string, unknown>): string[] {
  const raw = node["@type"];
  const list = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
  return list.map((item) => String(item).toLowerCase());
}

function str(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && "name" in (value as object)) {
    return str((value as { name?: unknown }).name);
  }
  return undefined;
}

function firstObject(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const first = value.find((item) => item && typeof item === "object");
    return first && typeof first === "object" ? (first as Record<string, unknown>) : null;
  }
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function collectImages(value: unknown, pageUrl: string): string[] {
  const urls: string[] = [];
  const push = (item: unknown) => {
    if (typeof item === "string") {
      const abs = absoluteUrl(item, pageUrl);
      if (abs) urls.push(abs);
    } else if (item && typeof item === "object" && "url" in item) {
      push((item as { url?: unknown }).url);
    }
  };
  if (Array.isArray(value)) value.forEach(push);
  else push(value);
  return unique(urls);
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = canonicalKey(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

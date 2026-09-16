import { absoluteUrl, canonicalKey, fetchText, originOf, type DiscoveredProduct } from "./fetchPage.js";

const JSON_PATHS = [
  "/api/public/deals",
  "/api/public/products",
  "/api/deals",
  "/api/products",
  "/products.json",
  "/deals.json",
  "/wp-json/wc/store/v1/products"
];

const MAX_PRODUCTS = 60;

export function looksLikeHtml(raw: string): boolean {
  return /^\s*<(!doctype\s+html|html[\s>])/i.test(raw);
}

export async function discoverJsonCatalog(websiteUrl: string): Promise<DiscoveredProduct[]> {
  const origin = originOf(websiteUrl);
  if (!origin) return [];
  for (const path of JSON_PATHS) {
    const raw = await fetchText(`${origin}${path}`, { accept: "application/json,text/json;q=0.9,*/*;q=0.1" });
    if (!raw || looksLikeHtml(raw)) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const products = productsFromJson(parsed, origin, path);
    if (products.length) return products;
  }
  return [];
}

export function productsFromJson(parsed: unknown, origin: string, sourcePath = ""): DiscoveredProduct[] {
  const out: DiscoveredProduct[] = [];
  for (const row of asRecords(parsed)) {
    const product = productFromRecord(row, origin, sourcePath);
    if (!product) continue;
    out.push(product);
    if (out.length >= MAX_PRODUCTS) break;
  }
  return out;
}

function asRecords(parsed: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(parsed)) return parsed.filter(isRecord);
  if (!isRecord(parsed)) return [];
  for (const key of ["deals", "products", "items", "results", "listings", "data"]) {
    const value = parsed[key];
    if (Array.isArray(value)) return value.filter(isRecord);
    if (isRecord(value) && Array.isArray(value.items)) return value.items.filter(isRecord);
  }
  return [];
}

function productFromRecord(row: Record<string, unknown>, origin: string, sourcePath: string): DiscoveredProduct | null {
  const title = str(row.title) || str(row.name) || str(row.headline);
  if (!title) return null;
  const imageUrls = collectImages(row, origin);
  const priceText = priceFrom(row);
  const pageUrl = onSiteUrl(row, origin, sourcePath);
  if (!pageUrl) return null;
  return {
    canonicalUrl: canonicalKey(pageUrl),
    title: title.slice(0, 180),
    priceText,
    description: str(row.description) || str(row.subtitle) || undefined,
    imageUrls
  };
}

function onSiteUrl(row: Record<string, unknown>, origin: string, sourcePath: string): string | null {
  for (const key of ["url", "permalink", "canonical_url", "canonicalUrl", "link", "path"]) {
    const raw = str(row[key]);
    if (!raw) continue;
    const abs = absoluteUrl(raw, origin);
    if (abs && new URL(abs).origin === origin) return abs;
  }
  const slug = str(row.slug) || str(row.handle);
  const id = row.id != null ? String(row.id) : "";
  const key = slug || id;
  if (!key) return null;
  if (/deal/i.test(sourcePath)) return `${origin}/deal/${encodeURIComponent(key)}`;
  return `${origin}/product/${encodeURIComponent(key)}`;
}

function priceFrom(row: Record<string, unknown>): string | undefined {
  const amount = num(row.current_price) ?? num(row.price) ?? num(row.sale_price) ?? num(row.lowPrice);
  if (amount == null) return undefined;
  const currency = str(row.currency) || str(row.priceCurrency) || "";
  const rounded = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return [rounded, currency].filter(Boolean).join(" ");
}

function collectImages(row: Record<string, unknown>, origin: string): string[] {
  const urls: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === "string") {
      const abs = absoluteUrl(value, origin);
      if (abs) urls.push(abs);
      return;
    }
    if (isRecord(value)) push(value.url ?? value.src ?? value.image_url);
  };
  push(row.image_url);
  push(row.imageUrl);
  push(row.image);
  push(row.thumbnail);
  push(row.featured_image);
  if (Array.isArray(row.images)) row.images.forEach(push);
  return [...new Set(urls.map(canonicalKey))].slice(0, 6);
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function num(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

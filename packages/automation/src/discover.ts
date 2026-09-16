import { extractLinks, extractProduct, looksLikeProductUrl } from "./extractProduct.js";
import { discoverJsonCatalog } from "./extractJsonCatalog.js";
import { absoluteUrl, canonicalKey, fetchText, originOf, type DiscoveredProduct } from "./fetchPage.js";
import { parseSitemapLocs } from "./parseSitemap.js";

const MAX_CANDIDATES = 40;
const MAX_PRODUCTS = 60;

export async function discoverProducts(websiteUrl: string, extraUrls: string[] = []): Promise<DiscoveredProduct[]> {
  const origin = originOf(websiteUrl);
  if (!origin) return [];
  const jsonProducts = await discoverJsonCatalog(websiteUrl);
  if (jsonProducts.length && extraUrls.length === 0) return jsonProducts.slice(0, MAX_PRODUCTS);

  const home = absoluteUrl(websiteUrl, origin) ?? origin;
  const extraKeys = new Set<string>();
  const candidates = new Set<string>();
  for (const extra of extraUrls) {
    const abs = absoluteUrl(extra, origin);
    if (!abs) continue;
    const key = canonicalKey(abs);
    extraKeys.add(key);
    candidates.add(key);
  }

  const sitemapXml = await fetchText(`${origin}/sitemap.xml`, { accept: "application/xml,text/xml,text/html" });
  if (sitemapXml) {
    const parsed = parseSitemapLocs(sitemapXml, origin);
    for (const nested of parsed.nestedSitemaps.slice(0, 3)) {
      const nestedXml = await fetchText(nested, { accept: "application/xml,text/xml" });
      if (!nestedXml) continue;
      const inner = parseSitemapLocs(nestedXml, origin);
      for (const page of inner.pages) {
        if (looksLikeProductUrl(page, origin)) candidates.add(canonicalKey(page));
      }
    }
    for (const page of parsed.pages) {
      if (looksLikeProductUrl(page, origin)) candidates.add(canonicalKey(page));
    }
  }

  const homeHtml = await fetchText(home);
  if (homeHtml) {
    for (const href of extractLinks(homeHtml, home)) {
      if (looksLikeProductUrl(href, origin)) candidates.add(canonicalKey(href));
    }
    const homeProduct = extractProduct(homeHtml, home);
    if (homeProduct?.imageUrls.length) {
      // Keep a homepage product only when it actually looks like a product card.
      if (looksLikeProductUrl(homeProduct.canonicalUrl, origin) || homeProduct.priceText) {
        candidates.add(homeProduct.canonicalUrl);
      }
    }
  }

  const rest = [...candidates].filter((url) => !extraKeys.has(url));
  const urls = [...extraKeys, ...rest].slice(0, MAX_CANDIDATES);
  const products = new Map<string, DiscoveredProduct>();
  for (const url of urls) {
    if (products.size >= MAX_PRODUCTS) break;
    const html = await fetchText(url);
    if (!html) continue;
    const product = extractProduct(html, url);
    if (!product?.title) continue;
    if (
      !extraKeys.has(canonicalKey(url)) &&
      !product.imageUrls.length &&
      !product.priceText &&
      !looksLikeProductUrl(url, origin)
    ) {
      continue;
    }
    products.set(product.canonicalUrl, product);
  }
  for (const product of jsonProducts) {
    if (products.size >= MAX_PRODUCTS) break;
    if (!products.has(product.canonicalUrl)) products.set(product.canonicalUrl, product);
  }
  return [...products.values()];
}

import { describe, expect, it } from "vitest";
import { extractProduct, looksLikeProductUrl } from "../extractProduct.js";
import { parseSitemapLocs } from "../parseSitemap.js";

describe("extractProduct", () => {
  it("reads JSON-LD Product name, price, and image", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
          {"@type":"Product","name":"Chalet Suite","description":"Snow view",
           "image":"https://hotel.example/suite.jpg",
           "offers":{"@type":"Offer","price":"120","priceCurrency":"EUR"},
           "url":"https://hotel.example/rooms/chalet"}
        </script>
      </head></html>
    `;
    const product = extractProduct(html, "https://hotel.example/rooms/chalet");
    expect(product?.title).toBe("Chalet Suite");
    expect(product?.priceText).toContain("120");
    expect(product?.imageUrls[0]).toContain("suite.jpg");
  });

  it("falls back to Open Graph tags", () => {
    const html = `
      <html><head>
        <meta property="og:title" content="Kosher dessert platter" />
        <meta property="og:image" content="/img/cake.jpg" />
        <meta property="product:price:amount" content="49" />
        <meta property="product:price:currency" content="ILS" />
      </head></html>
    `;
    const product = extractProduct(html, "https://shop.example/product/cake");
    expect(product?.title).toBe("Kosher dessert platter");
    expect(product?.imageUrls[0]).toBe("https://shop.example/img/cake.jpg");
    expect(product?.priceText).toBe("49 ILS");
  });
});

describe("looksLikeProductUrl", () => {
  it("accepts room and product paths on the same origin", () => {
    expect(looksLikeProductUrl("https://a.example/rooms/deluxe", "https://a.example")).toBe(true);
    expect(looksLikeProductUrl("https://a.example/privacy", "https://a.example")).toBe(false);
    expect(looksLikeProductUrl("https://other.example/product/x", "https://a.example")).toBe(false);
  });
});

describe("parseSitemapLocs", () => {
  it("splits page urls from nested sitemaps", () => {
    const xml = `
      <sitemapindex>
        <sitemap><loc>https://a.example/sitemap-products.xml</loc></sitemap>
        <url><loc>https://a.example/rooms/one</loc></url>
      </sitemapindex>
    `;
    const parsed = parseSitemapLocs(xml, "https://a.example");
    expect(parsed.nestedSitemaps.some((u) => u.includes("sitemap-products"))).toBe(true);
    expect(parsed.pages).toContain("https://a.example/rooms/one");
  });
});

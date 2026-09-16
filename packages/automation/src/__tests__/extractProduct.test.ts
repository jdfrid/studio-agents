import { describe, expect, it } from "vitest";
import { extractProduct, looksLikeProductUrl } from "../extractProduct.js";
import { productsFromJson } from "../extractJsonCatalog.js";
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

describe("productsFromJson", () => {
  it("reads a public deals feed with on-site deal URLs", () => {
    const products = productsFromJson(
      {
        deals: [
          {
            id: 5982,
            title: "Gold coin bezel",
            image_url: "https://cdn.example/bezel.jpg",
            current_price: 818.99,
            currency: "USD",
            ebay_url: "https://www.ebay.com/itm/1"
          }
        ]
      },
      "https://dealsluxy.com",
      "/api/public/deals"
    );
    expect(products).toHaveLength(1);
    expect(products[0]?.title).toBe("Gold coin bezel");
    expect(products[0]?.canonicalUrl).toBe("https://dealsluxy.com/deal/5982");
    expect(products[0]?.priceText).toBe("818.99 USD");
    expect(products[0]?.imageUrls[0]).toContain("bezel.jpg");
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
  it("ignores SPA HTML that is not a sitemap", () => {
    const parsed = parseSitemapLocs("<!DOCTYPE html><html><body>no locs</body></html>", "https://a.example");
    expect(parsed.pages).toEqual([]);
    expect(parsed.nestedSitemaps).toEqual([]);
  });

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

export const BRAND_POSTERS = [
  {
    id: "coffee",
    src: "/brand/coffee-poster.svg",
    labelKey: "coffee"
  },
  {
    id: "product",
    src: "/brand/product-poster.svg",
    labelKey: "product"
  },
  {
    id: "travel",
    src: "/brand/travel-poster.svg",
    labelKey: "travel"
  }
] as const;

export type BrandPosterId = (typeof BRAND_POSTERS)[number]["id"];

export function brandPosterFor(seed: string) {
  let n = 0;
  for (let i = 0; i < seed.length; i++) n += seed.charCodeAt(i);
  return BRAND_POSTERS[n % BRAND_POSTERS.length] ?? BRAND_POSTERS[0];
}

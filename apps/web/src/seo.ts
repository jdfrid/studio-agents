const SITE = "https://prompt2spot.com";

export type SeoInput = {
  title: string;
  description: string;
  path: string;
};

function setMeta(attribute: "name" | "property", key: string, value: string) {
  const selector = `meta[${attribute}="${key}"]`;
  let el = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attribute, key);
    document.head.appendChild(el);
  }
  el.content = value;
}

export function applySeo({ title, description, path }: SeoInput): void {
  const url = `${SITE}${path === "/" ? "/" : path}`;
  document.title = title;
  setMeta("name", "description", description);
  setMeta("property", "og:title", title);
  setMeta("property", "og:description", description);
  setMeta("property", "og:url", url);
  setMeta("name", "twitter:title", title);
  setMeta("name", "twitter:description", description);
  let canonical = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }
  canonical.href = url;
}

export const defaultSeo = {
  title: "Prompt2Spot — AI video studio for business videos",
  description:
    "Turn a brief and brand assets into a publish-ready business video. Script, voice, visuals, captions, and render in one guided studio."
};

import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const START = "<!-- growth:learn:start -->";
const END = "<!-- growth:learn:end -->";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const GOOGLE_TAG = `<!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-JX95ZGHQ6Z"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());

    gtag('config', 'G-JX95ZGHQ6Z');
  </script>`;

export type LearnArticle = {
  slug: string;
  title: string;
  description: string;
  body: string;
};

export function renderArticle(article: LearnArticle, pageUrl: string): string {
  const paragraphs = article.body
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${escapeHtml(part).replaceAll("\n", "<br>")}</p>`)
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  ${GOOGLE_TAG}
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(article.title)} — Reelmino</title>
  <meta name="description" content="${escapeHtml(article.description)}">
  <link rel="canonical" href="${escapeHtml(pageUrl)}">
  <meta property="og:title" content="${escapeHtml(article.title)}">
  <meta property="og:description" content="${escapeHtml(article.description)}">
  <meta property="og:url" content="${escapeHtml(pageUrl)}">
  <meta property="og:type" content="article">
  <style>
    body { font-family: Georgia, serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; color: #173d35; background: #f6f7f2; }
    a { color: #173d35; }
    .cta { display: inline-block; margin-top: 1.5rem; background: #173d35; color: #d9f27a; padding: 0.7rem 1rem; text-decoration: none; }
  </style>
</head>
<body>
  <p><a href="https://reelmino.com/">Reelmino</a></p>
  <h1>${escapeHtml(article.title)}</h1>
  ${paragraphs}
  <p><a class="cta" href="https://reelmino.com/">Create your first video</a></p>
</body>
</html>
`;
}

export function renderLearnIndex(articles: LearnArticle[], origin: string): string {
  const items = articles
    .map((article) => `<li><a href="${escapeHtml(`${origin}/learn/${article.slug}/`)}">${escapeHtml(article.title)}</a><br>${escapeHtml(article.description)}</li>`)
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  ${GOOGLE_TAG}
  <meta charset="utf-8">
  <title>Learn — Reelmino</title>
  <meta name="description" content="How Reelmino turns a business idea into a finished video.">
  <link rel="canonical" href="${escapeHtml(`${origin}/learn/`)}">
</head>
<body>
  <p><a href="https://reelmino.com/">Reelmino</a></p>
  <h1>Learn</h1>
  <ul>
    ${items}
  </ul>
</body>
</html>
`;
}

export function spliceSitemap(xml: string, locs: string[]): string {
  const lines = locs.map(
    (loc) => `  <url><loc>${escapeHtml(loc)}</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>`
  );
  const block = [START, ...lines, END].join("\n");
  const pattern = new RegExp(`${START}[\\s\\S]*?${END}`);
  if (pattern.test(xml)) return xml.replace(pattern, block);
  if (!xml.includes("</urlset>")) return `${xml.trim()}\n${block}\n`;
  return xml.replace("</urlset>", `${block}\n</urlset>`);
}

export function writeLearnSite(input: {
  publicDir: string;
  origin: string;
  articles: LearnArticle[];
  /** The site's own sitemap, when the output folder is a separate volume served next to the built site. */
  sitemapBase?: string;
}): { count: number; index: string } {
  const learnDir = path.join(input.publicDir, "learn");
  mkdirSync(learnDir, { recursive: true });
  const manifestPath = path.join(learnDir, ".growth-slugs.json");
  const previous: string[] = existsSync(manifestPath) ? (JSON.parse(readFileSync(manifestPath, "utf8")) as string[]) : [];
  const next = new Set(input.articles.map((article) => article.slug));
  for (const slug of previous) {
    if (!next.has(slug)) rmSync(path.join(learnDir, slug), { recursive: true, force: true });
  }
  for (const article of input.articles) {
    const dir = path.join(learnDir, article.slug);
    mkdirSync(dir, { recursive: true });
    const pageUrl = `${input.origin}/learn/${article.slug}/`;
    writeFileSync(path.join(dir, "index.html"), renderArticle(article, pageUrl), "utf8");
  }
  writeFileSync(path.join(learnDir, "index.html"), renderLearnIndex(input.articles, input.origin), "utf8");
  writeFileSync(manifestPath, JSON.stringify([...next], null, 2), "utf8");
  const sitemapPath = path.join(input.publicDir, "sitemap.xml");
  const source = input.sitemapBase && existsSync(input.sitemapBase) ? input.sitemapBase : sitemapPath;
  const current = existsSync(source)
    ? readFileSync(source, "utf8")
    : `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n`;
  const locs = [`${input.origin}/learn/`, ...input.articles.map((article) => `${input.origin}/learn/${article.slug}/`)];
  writeFileSync(sitemapPath, spliceSitemap(current, locs), "utf8");
  return { count: input.articles.length, index: `${input.origin}/learn/` };
}

export const DIRECTORY_SEEDS = [
  {
    id: "product-hunt",
    name: "Product Hunt",
    submitUrl: "https://www.producthunt.com/posts/new"
  },
  {
    id: "alternativeto",
    name: "AlternativeTo",
    submitUrl: "https://alternativeto.net/software/add/"
  },
  {
    id: "taaft",
    name: "There's An AI For That",
    submitUrl: "https://theresanaiforthat.com/submit/"
  },
  {
    id: "futurepedia",
    name: "Futurepedia",
    submitUrl: "https://www.futurepedia.io/submit-tool"
  },
  {
    id: "betalist",
    name: "BetaList",
    submitUrl: "https://betalist.com/submit"
  }
];

export const DIRECTORY_BLURB =
  "Reelmino turns a brief and optional product photos into a finished business video: script, voice, scenes, captions, branding and a final render. One guided workflow, instead of stitching separate AI tools together. https://reelmino.com";

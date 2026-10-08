import { mkdir, writeFile } from "node:fs/promises";
import { PACKAGES } from "./packages.mjs";

const root = new URL("./", import.meta.url);
const WORDS_PER_SECOND = 2.5;

const words = (text) => (text ? text.split(/\s+/).filter(Boolean).length : 0);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
const firstAsset = (asset) => asset.split("→")[0].trim();

function voText(pkg) {
  return pkg.shots.map((s) => s[3]).filter(Boolean).join(" ");
}

function markdown(pkg) {
  const vo = voText(pkg);
  const assets = [...new Set(pkg.shots.flatMap((s) => s[1].split("→").map((a) => a.trim())).filter((a) => a !== "END CARD"))];
  return `# ${pkg.id} · ${pkg.name}

**Feature:** ${pkg.feature}
**Audience:** ${pkg.audience}
**Length:** 30 seconds · 9:16 (1080×1920) · also works 1:1 for X and Telegram
**Hook (first 3 seconds):** ${pkg.hook}
**Key message:** ${pkg.message}

## What the feature does

${pkg.description}

## Script and shot list

| Time | Screen / footage | Motion / edit | Voice-over | On-screen text |
|---|---|---|---|---|
${pkg.shots.map((s) => `| ${s[0]} | \`${cell(s[1])}\` | ${cell(s[2])} | ${cell(s[3])} | **${cell(s[4])}** |`).join("\n")}

**Full voice-over** (${words(vo)} words, about ${Math.round(words(vo) / WORDS_PER_SECOND)} seconds at a natural pace):

> ${vo}
${pkg.notes ? `\n**Production note:** ${pkg.notes}\n` : ""}
## Assets used

${assets.map((a) => `- \`${a}\``).join("\n")}

## Platform copy

### YouTube Shorts

**Title:** ${pkg.copy.youtubeTitle}

**Description:**

\`\`\`text
${pkg.copy.youtubeDescription}

${pkg.copy.hashtags.join(" ")} #Shorts
\`\`\`

### TikTok

\`\`\`text
${pkg.copy.tiktokCaption} ${pkg.copy.hashtags.join(" ")}
\`\`\`

### Telegram

\`\`\`text
${pkg.copy.telegram}
\`\`\`

### X

\`\`\`text
${pkg.copy.x}
\`\`\`

_X post length: ${pkg.copy.x.replace(/https:\/\/\S+/g, "x".repeat(23)).length} / 280 characters (links count as 23)._
`;
}

function thumb(asset) {
  const a = firstAsset(asset);
  if (a === "END CARD") return `<div class="frame endcard"><img src="brand/logo-primary.svg" alt="Reelmino"><span>reelmino.com</span></div>`;
  if (a.endsWith(".mp4")) return `<div class="frame"><video src="${esc(a)}" muted loop playsinline preload="metadata" onmouseenter="this.play()" onmouseleave="this.pause()"></video><em>video</em></div>`;
  return `<div class="frame"><img src="${esc(a)}" alt="" loading="lazy"></div>`;
}

function html() {
  const sections = PACKAGES.map(
    (pkg) => `
  <section id="p${pkg.id}">
    <header>
      <span class="id">${pkg.id}</span>
      <div>
        <h2>${esc(pkg.name)}</h2>
        <p>${esc(pkg.feature)} · <a href="packages/${pkg.id}-${pkg.slug}.md">script &amp; copy</a></p>
      </div>
    </header>
    <ol class="shots">
      ${pkg.shots
        .map(
          (s) => `<li>
        ${thumb(s[1])}
        <time>${esc(s[0])}</time>
        <strong>${esc(s[4])}</strong>
        <p>${esc(s[3])}</p>
      </li>`
        )
        .join("\n      ")}
    </ol>
  </section>`
  ).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reelmino promo kit — storyboards</title>
<style>
  :root { --forest: #173d35; --lime: #d9f27a; --paper: #f6f7f2; --ink: #172c26; --muted: #5f6f68; --border: #dfe4da; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Manrope", system-ui, sans-serif; background: var(--paper); color: var(--ink); }
  .top { padding: 32px 28px 8px; max-width: 1400px; margin: 0 auto; }
  .top h1 { margin: 0 0 6px; font-size: 2rem; }
  .top p { margin: 0; color: var(--muted); }
  nav { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 16px; }
  nav a { padding: 6px 12px; border: 1px solid var(--border); border-radius: 999px; background: #fff; color: var(--forest); text-decoration: none; font-size: .82rem; font-weight: 700; }
  section { max-width: 1400px; margin: 28px auto; padding: 22px 28px; background: #fff; border: 1px solid var(--border); border-radius: 22px; }
  section header { display: flex; gap: 14px; align-items: center; margin-bottom: 16px; }
  .id { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; background: var(--lime); color: var(--forest); font-weight: 800; }
  h2 { margin: 0; font-size: 1.25rem; }
  header p { margin: 2px 0 0; color: var(--muted); font-size: .88rem; }
  header a { color: var(--forest); font-weight: 700; }
  .shots { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(7, minmax(150px, 1fr)); gap: 14px; overflow-x: auto; }
  .shots li { display: grid; gap: 6px; align-content: start; }
  .frame { position: relative; aspect-ratio: 9 / 16; border-radius: 16px; overflow: hidden; border: 1px solid var(--border); background: #000; }
  .frame img, .frame video { width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; }
  .frame em { position: absolute; top: 8px; left: 8px; padding: 2px 8px; border-radius: 999px; background: var(--lime); color: var(--forest); font-style: normal; font-size: .7rem; font-weight: 800; }
  .endcard { display: grid; place-content: center; gap: 10px; justify-items: center; background: var(--paper); }
  .endcard img { width: 70%; height: auto; object-fit: contain; }
  .endcard span { color: var(--forest); font-weight: 700; font-size: .8rem; }
  time { color: var(--muted); font-size: .75rem; font-weight: 700; }
  li strong { font-size: .78rem; color: var(--forest); }
  li p { margin: 0; font-size: .8rem; line-height: 1.45; color: var(--ink); }
</style>
</head>
<body>
  <div class="top">
    <h1>Reelmino promo kit</h1>
    <p>${PACKAGES.length} packages · 30 seconds each · mobile screens captured at 1170×2532 (iPhone, 3×). Hover a video frame to preview it.</p>
    <nav>${PACKAGES.map((p) => `<a href="#p${p.id}">${p.id} · ${esc(p.name)}</a>`).join("")}</nav>
  </div>
${sections}
</body>
</html>
`;
}

await mkdir(new URL("packages/", root), { recursive: true });
for (const pkg of PACKAGES) {
  await writeFile(new URL(`packages/${pkg.id}-${pkg.slug}.md`, root), markdown(pkg));
  const n = words(voText(pkg));
  const xLen = pkg.copy.x.replace(/https:\/\/\S+/g, "x".repeat(23)).length;
  console.log(`${pkg.id} ${pkg.slug.padEnd(30)} VO ${String(n).padStart(3)} words (~${Math.round(n / WORDS_PER_SECOND)}s)  X ${xLen}/280${n / WORDS_PER_SECOND > 28 ? "  <-- VO too long" : ""}${xLen > 280 ? "  <-- X too long" : ""}`);
}
await writeFile(new URL("index.html", root), html());
console.log("wrote packages/*.md and index.html");

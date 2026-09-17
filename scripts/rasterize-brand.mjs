import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function png(svgPath, outPath, width) {
  const svg = readFileSync(svgPath);
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: width } });
  writeFileSync(outPath, resvg.render().asPng());
}

const symbol = join(root, "apps/web/public/brand/symbol-forest.svg");
const outroSvg = join(root, "packages/agents/render/assets/reelmino-outro.svg");
const webFavicon = join(root, "apps/web/public/favicon.png");
const adminPublic = join(root, "apps/admin/public");
mkdirSync(adminPublic, { recursive: true });
mkdirSync(join(adminPublic, "brand"), { recursive: true });

png(symbol, webFavicon, 180);
copyFileSync(webFavicon, join(adminPublic, "favicon.png"));
copyFileSync(symbol, join(adminPublic, "brand/app-icon.svg"));
copyFileSync(symbol, join(adminPublic, "brand/symbol-forest.svg"));
png(outroSvg, join(root, "packages/agents/render/assets/reelmino-outro.png"), 1920);

console.log("Wrote favicon.png and reelmino-outro.png");

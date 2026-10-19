import path from "node:path";
import { fileURLToPath } from "node:url";

export function defaultPaths() {
  const srcDir = path.dirname(fileURLToPath(import.meta.url));
  const appRoot = path.resolve(srcDir, "..");
  const repoRoot = path.resolve(appRoot, "../..");
  return {
    appRoot,
    repoRoot,
    dataDir: path.join(appRoot, "data"),
    webPublic: path.join(repoRoot, "apps/web/public"),
    promoKit: path.join(repoRoot, "marketing/promo-kit")
  };
}

import { fetchText, type DiscoveredProduct } from "@studio/automation";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export async function refreshProductSnapshot(url: string): Promise<DiscoveredProduct | null> {
  const { extractProduct } = await import("@studio/automation");
  const html = await fetchText(url);
  if (!html) return null;
  return extractProduct(html, url);
}

export async function productImagesAsDataUrls(imageUrls: string[]): Promise<
  Array<{ name: string; mimeType: string; kind: "image"; role: "product"; dataUrl: string }>
> {
  const out: Array<{ name: string; mimeType: string; kind: "image"; role: "product"; dataUrl: string }> = [];
  for (const url of imageUrls.slice(0, 3)) {
    const packed = await downloadImageDataUrl(url);
    if (!packed) continue;
    out.push({
      name: filenameFromUrl(url),
      mimeType: packed.mimeType,
      kind: "image",
      role: "product",
      dataUrl: packed.dataUrl
    });
  }
  return out;
}

async function downloadImageDataUrl(url: string): Promise<{ mimeType: string; dataUrl: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": "Prompt2SpotBot/0.1 (+https://prompt2spot.com)", accept: "image/*" }
    });
    if (!res.ok) return null;
    const mimeType = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0]!.trim();
    if (!mimeType.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.byteLength || buf.byteLength > MAX_IMAGE_BYTES) return null;
    return { mimeType, dataUrl: `data:${mimeType};base64,${buf.toString("base64")}` };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function filenameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const base = path.split("/").filter(Boolean).at(-1) || "product.jpg";
    return base.slice(0, 80);
  } catch {
    return "product.jpg";
  }
}

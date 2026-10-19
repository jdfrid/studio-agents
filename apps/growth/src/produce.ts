import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadPromoPackages, type PromoPackage } from "./catalog.js";
import { nid } from "./crypto.js";
import { getItem, listItems, updateItem, type GrowthDb, type Item } from "./db.js";

const SECONDS_PER_SCENE = 6;
const END_CARD_SECONDS = 6;

export function briefForPackage(pkg: PromoPackage): Record<string, unknown> {
  const scenes = pkg.shots.filter((shot) => shot[1] !== "END CARD" && !String(shot[1]).endsWith(".mp4"));
  const narration = scenes
    .map((shot, index) => `Scene ${index + 1}: narration "${shot[3]}" — on-screen text: ${shot[4]} — visual: ${shot[2]}`)
    .join("\n");
  return {
    title: `Reelmino promo ${pkg.id} — ${pkg.name}`,
    sourceText: [
      "A short vertical social ad for Reelmino, an app that turns a one-sentence idea into a finished branded business video.",
      `Feature in this ad: ${pkg.feature}.`,
      `What it does: ${pkg.description}`,
      `Audience: ${pkg.audience}.`,
      narration,
      "Platform: TikTok, Instagram Reels and YouTube Shorts."
    ].join("\n"),
    targetAudience: pkg.audience,
    language: "en",
    durationSeconds: scenes.length * SECONDS_PER_SCENE + END_CARD_SECONDS,
    aspectRatio: "9:16",
    budgetMode: true,
    approvalMode: "auto"
  };
}

function apiBase(): string {
  return (process.env.REELMINO_API ?? "https://reelmino.com/api").replace(/\/$/, "");
}

function session(): string {
  const value = process.env.REELMINO_SESSION?.trim();
  if (!value) throw new Error("Set REELMINO_SESSION to a Reelmino studio_session cookie");
  return value;
}

async function reelmino(pathname: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`${apiBase()}${pathname}`, {
    ...init,
    headers: {
      cookie: `studio_session=${session()}`,
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${pathname} -> ${response.status}: ${text.slice(0, 240)}`);
  return text ? JSON.parse(text) : {};
}

export async function produceItem(db: GrowthDb, promoKit: string, item: Item): Promise<Item> {
  const match = /^kit-(\d+)-/.exec(item.slug);
  if (!match) throw new Error("production from Reelmino is available for promo-kit items");
  const packages = await loadPromoPackages(promoKit);
  const pkg = packages.find((row) => row.id === match[1]);
  if (!pkg) throw new Error("promo package not found");
  const created = (await reelmino("/runs", {
    method: "POST",
    body: JSON.stringify({ brief: briefForPackage(pkg) })
  })) as { id?: string };
  if (!created.id) throw new Error("Reelmino did not return a run id");
  return updateItem(db, item.id, { reelminoRunId: created.id })!;
}

export async function pullItem(db: GrowthDb, mediaDir: string, item: Item): Promise<Item> {
  if (!item.reelminoRunId) throw new Error("this item has no Reelmino run");
  const payload = (await reelmino(`/runs/${item.reelminoRunId}/artifacts`)) as { artifacts?: Array<{ id: string; kind: string }> } | Array<{ id: string; kind: string }>;
  const list = Array.isArray(payload) ? payload : payload.artifacts ?? [];
  const final = [...list].reverse().find((row) => row.kind === "final_video");
  if (!final) throw new Error("video is not ready yet");
  const signed = (await reelmino(`/artifacts/${final.id}/signed-url`)) as { url?: string; signedUrl?: string };
  const remote = signed.url ?? signed.signedUrl;
  if (!remote) throw new Error("missing download url");
  const response = await fetch(remote);
  if (!response.ok) throw new Error(`download -> ${response.status}`);
  mkdirSync(mediaDir, { recursive: true });
  const filename = `${nid()}.mp4`;
  writeFileSync(path.join(mediaDir, filename), Buffer.from(await response.arrayBuffer()));
  return updateItem(db, item.id, {
    mediaPath: filename,
    mediaMime: "video/mp4",
    mediaKind: "video",
    mediaWidth: 1080,
    mediaHeight: 1920,
    mediaDurationMs: 30_000
  })!;
}

export async function pullReady(db: GrowthDb, mediaDir: string): Promise<{ pulled: number; waiting: number; errors: string[] }> {
  let pulled = 0;
  let waiting = 0;
  const errors: string[] = [];
  for (const item of listItems(db)) {
    if (!item.reelminoRunId || item.mediaPath) continue;
    try {
      await pullItem(db, mediaDir, item);
      pulled += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("not ready")) waiting += 1;
      else errors.push(`${item.title}: ${message}`);
    }
  }
  return { pulled, waiting, errors };
}

export function requireItem(db: GrowthDb, id: string): Item {
  const item = getItem(db, id);
  if (!item) throw new Error("item not found");
  return item;
}

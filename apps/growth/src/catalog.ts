import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { assetKind, CALENDAR, networksForKind, SCRIPT_STARTERS, slotInstant, slotWhen } from "./calendar.js";
import { copyFromCalendar, copyFromPromo, type ItemCopy } from "./copy.js";
import { getItemBySlug, insertEmail, insertItem, listEmails, updateItem, upsertPlannedSlot, type GrowthDb } from "./db.js";
import { nid } from "./crypto.js";

export type PromoPackage = {
  id: string;
  slug: string;
  name: string;
  feature: string;
  audience: string;
  hook: string;
  message: string;
  description: string;
  shots: string[][];
  copy: {
    youtubeTitle: string;
    youtubeDescription: string;
    tiktokCaption: string;
    hashtags: string[];
    telegram: string;
    x: string;
  };
};

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
  return slug || "item";
}

export async function loadPromoPackages(promoKit: string): Promise<PromoPackage[]> {
  const mod = (await import(pathToFileURL(path.join(promoKit, "packages.mjs")).href)) as { PACKAGES: PromoPackage[] };
  return mod.PACKAGES;
}

function findCut(promoKit: string, pkg: PromoPackage): string | null {
  const name = `${pkg.id}-${pkg.slug}.mp4`;
  const candidates = [path.join(promoKit, "output", name), path.join(promoKit, "output", "v1", name)];
  return candidates.find((file) => existsSync(file)) ?? null;
}

export async function importPromoKit(db: GrowthDb, promoKit: string, mediaDir: string): Promise<{ imported: number }> {
  mkdirSync(mediaDir, { recursive: true });
  const packages = await loadPromoPackages(promoKit);
  let imported = 0;
  for (const pkg of packages) {
    const slug = `kit-${pkg.id}-${pkg.slug}`;
    const copy = copyFromPromo({
      name: pkg.name,
      feature: pkg.feature,
      hook: pkg.hook,
      message: pkg.message,
      description: pkg.description,
      ...pkg.copy
    });
    const existing = getItemBySlug(db, slug);
    if (!existing) {
      const id = nid();
      let mediaPath: string | null = null;
      const cut = findCut(promoKit, pkg);
      if (cut) {
        mediaPath = `${id}.mp4`;
        copyFileSync(cut, path.join(mediaDir, mediaPath));
      }
      insertItem(db, {
        id,
        slug,
        source: "kit",
        title: pkg.name,
        summary: pkg.message,
        language: "en",
        copy,
        mediaPath,
        mediaMime: mediaPath ? "video/mp4" : null,
        mediaKind: mediaPath ? "video" : null,
        mediaWidth: mediaPath ? 1080 : null,
        mediaHeight: mediaPath ? 1920 : null,
        mediaDurationMs: mediaPath ? 30_000 : null,
        reelminoRunId: null
      });
      imported += 1;
    } else {
      const cut = existing.mediaPath ? null : findCut(promoKit, pkg);
      const media = cut ? { mediaPath: `${existing.id}.mp4`, mediaMime: "video/mp4", mediaKind: "video", mediaWidth: 1080, mediaHeight: 1920, mediaDurationMs: 30_000 } : {};
      if (cut) copyFileSync(cut, path.join(mediaDir, media.mediaPath!));
      updateItem(db, existing.id, { title: pkg.name, summary: pkg.message, copy, ...media });
    }
  }
  return { imported };
}

export function importCalendar(db: GrowthDb, startMonday: string): { items: number; slots: number } {
  let items = 0;
  let slots = 0;
  for (const week of CALENDAR) {
    let shortOrdinal = 0;
    week.assets.forEach((title, index) => {
      const kind = assetKind(title);
      const slug = `w${String(week.week).padStart(2, "0")}-${index + 1}-${slugify(title)}`;
      const copy: ItemCopy = copyFromCalendar({ title, goal: week.goal, cta: week.cta, kind });
      let item = getItemBySlug(db, slug);
      if (!item) {
        item = insertItem(db, {
          id: nid(),
          slug,
          source: "calendar",
          title: title.replaceAll("Prompt2Spot", "Reelmino"),
          summary: week.goal,
          language: "en",
          copy,
          mediaPath: null,
          mediaMime: null,
          mediaKind: null,
          mediaWidth: null,
          mediaHeight: null,
          mediaDurationMs: null,
          reelminoRunId: null
        });
        items += 1;
      }
      if (kind === "email" && !listEmails(db).some((email) => email.itemId === item!.id)) {
        insertEmail(db, { id: nid(), itemId: item.id, subject: copy.email.subject ?? title, body: copy.email.body ?? "" });
      }
      const when = slotWhen(kind, shortOrdinal);
      if (kind === "short") shortOrdinal += 1;
      const scheduledFor = slotInstant(startMonday, week.week, when.day, when.hour);
      for (const network of networksForKind(kind)) {
        upsertPlannedSlot(db, {
          id: `${item.id}:${network}`,
          itemId: item.id,
          network,
          scheduledFor,
          origin: "calendar"
        });
        slots += 1;
      }
    });
  }
  for (const script of SCRIPT_STARTERS) {
    if (getItemBySlug(db, script.slug)) continue;
    const copy = copyFromCalendar({ title: script.title, goal: script.body, cta: "https://reelmino.com", kind: "short" });
    insertItem(db, {
      id: nid(),
      slug: script.slug,
      source: "script",
      title: script.title,
      summary: "Reusable short-form script. Do not invent measured numbers.",
      language: "en",
      copy,
      mediaPath: null,
      mediaMime: null,
      mediaKind: null,
      mediaWidth: null,
      mediaHeight: null,
      mediaDurationMs: null,
      reelminoRunId: null
    });
    items += 1;
  }
  return { items, slots };
}

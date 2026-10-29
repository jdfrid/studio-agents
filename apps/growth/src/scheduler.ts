import { decideSlot } from "./schedule.js";
import {
  claimSlot,
  destinationsForNetwork,
  dueSlots,
  flag,
  getDestination,
  getItem,
  getSetting,
  insertJob,
  listEmails,
  processingJobs,
  setSlotStatus,
  updateEmail,
  updateJob,
  listItems,
  type GrowthDb,
  type Slot
} from "./db.js";
import { nid } from "./crypto.js";
import { writeLearnSite, type LearnArticle } from "./internet.js";
import { sendGrowthMail } from "./mail.js";
import { composeFreshCopy } from "./angles.js";
import { applyLink, trackedLink } from "./utm.js";
import { deliverDueGroupPosts } from "./groups.js";
import { pollPublish, postDueFirstComments, runPublish } from "./publish.js";
import { advanceKeywordFeeds } from "./keywordFeeds.js";
import { advanceScriptBank } from "./scriptBank.js";
import { advanceYoutubeTrends } from "./youtubeTrends.js";

export type DispatchContext = {
  db: GrowthDb;
  key: Buffer;
  mediaDir: string;
  publicBase: string;
  webPublic: string;
  sitemapBase?: string;
  origin: string;
};

function articlesOf(db: GrowthDb): LearnArticle[] {
  return listItems(db)
    .filter((item) => item.copy.article?.body?.trim())
    .map((item) => ({
      slug: item.slug,
      title: item.copy.article.title || item.title,
      description: item.copy.article.description || item.summary,
      body: item.copy.article.body
    }));
}

export async function dispatchSlot(ctx: DispatchContext, slot: Slot): Promise<void> {
  const destination = slot.destinationId
    ? getDestination(ctx.db, slot.destinationId)
    : destinationsForNetwork(ctx.db, slot.network).filter((row) => row.enabled && row.kind !== "group");
  const chosen = Array.isArray(destination) ? (destination.length === 1 ? destination[0] : null) : destination;
  const decision = decideSlot({
    network: slot.network,
    origin: slot.origin,
    destination: chosen ? { enabled: chosen.enabled, autopilot: chosen.autopilot } : null,
    emailAutopilot: flag(ctx.db, "email_autopilot"),
    siteAutopilot: flag(ctx.db, "site_autopilot")
  });
  if (decision === "skipped") {
    setSlotStatus(ctx.db, slot.id, "skipped", "destination disabled");
    return;
  }
  if (decision === "needs_review") {
    const note = chosen ? null : slot.network === "email" || slot.network === "site" ? null : "Connect one destination, or pick one, then approve.";
    setSlotStatus(ctx.db, slot.id, "needs_review", note);
    return;
  }
  if (!claimSlot(ctx.db, slot.id, "queued", null)) return;
  const item = getItem(ctx.db, slot.itemId);
  if (!item) {
    setSlotStatus(ctx.db, slot.id, "failed", "item missing");
    return;
  }
  if (slot.network === "site") {
    writeLearnSite({ publicDir: ctx.webPublic, origin: ctx.origin, articles: articlesOf(ctx.db), sitemapBase: ctx.sitemapBase });
    const job = insertJob(ctx.db, { id: nid(), itemId: item.id, destinationId: null, slotId: slot.id, network: "site", status: "published" });
    updateJob(ctx.db, job.id, { status: "published", remoteUrl: `${ctx.origin}/learn/${item.slug}/`, publishedAt: new Date().toISOString(), lastError: null });
    return;
  }
  if (slot.network === "email") {
    await sendEmailSlot(ctx, slot, item.id);
    return;
  }
  if (!chosen) {
    setSlotStatus(ctx.db, slot.id, "needs_review", "Connect one destination for this network.");
    return;
  }
  await runPublish({
    db: ctx.db,
    key: ctx.key,
    mediaDir: ctx.mediaDir,
    publicBase: ctx.publicBase,
    item,
    destination: chosen,
    slotId: slot.id,
    campaign: getSetting(ctx.db, "utm_campaign") ?? undefined
  });
}

async function sendEmailSlot(ctx: DispatchContext, slot: Slot, itemId: string): Promise<void> {
  const item = getItem(ctx.db, itemId);
  if (!item) return;
  const caption = composeFreshCopy({
    item,
    network: "email",
    seed: `email:${slot.id}:${slot.scheduledFor}`
  });
  const body = applyLink(caption.body, trackedLink({ network: "email", slug: item.slug, format: "email", campaign: getSetting(ctx.db, "utm_campaign") ?? undefined }));
  const to = process.env.GROWTH_MAIL_TO?.trim();
  const job = insertJob(ctx.db, { id: nid(), itemId, destinationId: null, slotId: slot.id, network: "email", status: "uploading" });
  updateJob(ctx.db, job.id, { handle: { caption } });
  const draft = listEmails(ctx.db).find((row) => row.itemId === itemId && row.status === "draft");
  if (!to) {
    updateJob(ctx.db, job.id, { status: "failed", lastError: "Set GROWTH_MAIL_TO", errorCode: "validation" });
    return;
  }
  try {
    await sendGrowthMail({ to, subject: caption.title || item.title, text: body });
    if (draft) updateEmail(ctx.db, draft.id, { status: "sent", sentAt: new Date().toISOString(), lastError: null });
    updateJob(ctx.db, job.id, { status: "published", publishedAt: new Date().toISOString(), lastError: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (draft) updateEmail(ctx.db, draft.id, { status: "failed", lastError: message });
    updateJob(ctx.db, job.id, { status: "failed", lastError: message, errorCode: "upload_failed" });
  }
}

export async function tick(ctx: DispatchContext): Promise<void> {
  for (const slot of dueSlots(ctx.db, new Date().toISOString())) {
    try {
      await dispatchSlot(ctx, slot);
    } catch (error) {
      setSlotStatus(ctx.db, slot.id, "failed", error instanceof Error ? error.message : String(error));
    }
  }
  for (const job of processingJobs(ctx.db)) {
    try {
      await pollPublish(ctx.db, ctx.key, job.id);
    } catch (error) {
      console.error("[growth] poll failed", error);
    }
  }
  try {
    await deliverDueGroupPosts({ ...ctx, campaign: getSetting(ctx.db, "utm_campaign") ?? undefined });
  } catch (error) {
    console.error("[growth] group delivery failed", error);
  }
  try {
    await postDueFirstComments({ db: ctx.db, key: ctx.key });
  } catch (error) {
    console.error("[growth] first comment failed", error);
  }
  try {
    await advanceYoutubeTrends(ctx);
  } catch (error) {
    console.error("[growth] youtube trends failed", error);
  }
  try {
    await advanceKeywordFeeds(ctx);
  } catch (error) {
    console.error("[growth] keyword feeds failed", error);
  }
  try {
    await advanceScriptBank(ctx);
  } catch (error) {
    console.error("[growth] script bank failed", error);
  }
}

export function startScheduler(ctx: DispatchContext): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void tick(ctx)
      .catch((error) => console.error("[growth] scheduler", error))
      .finally(() => {
        running = false;
      });
  }, 30_000);
  timer.unref?.();
  return () => clearInterval(timer);
}


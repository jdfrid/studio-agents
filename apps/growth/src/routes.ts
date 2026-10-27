import "@fastify/cookie";
import "@fastify/multipart";
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { beginOAuth, connectTelegram, finishOAuth, networkSetup, oauthNetworks, removeConnection, syncConnection } from "./accounts.js";
import { importCalendar, importPromoKit, slugify } from "./catalog.js";
import { composeFreshCopy } from "./angles.js";
import { emptyCopy, EXPORT_NETWORKS, type ItemCopy } from "./copy.js";
import { encryptJson, hashPassword, hashToken, nid, verifyPassword } from "./crypto.js";
import {
  createSession,
  deleteGroup,
  deleteOperator,
  deleteSession,
  findOperatorByPassword,
  finishGroupPost,
  flag,
  getGroup,
  getGroupPost,
  getJob,
  insertGroup,
  insertOperator,
  listGroupPosts,
  listGroups,
  listOperators,
  queueGroupPosts,
  updateGroup,
  getDestination,
  getEmail,
  getItem,
  getSetting,
  insertEmail,
  insertItem,
  listConnections,
  listDestinations,
  listDirectories,
  listEmails,
  listItems,
  listJobs,
  listSlots,
  listTrendCycles,
  reopenSlot,
  sessionValid,
  setDestinationFlags,
  setSetting,
  updateDirectory,
  updateEmail,
  updateItem,
  upsertPlannedSlot,
  type GrowthDb
} from "./db.js";
import {
  facebookShareUrl,
  GROUP_NETWORKS,
  groupText,
  isAutoNetwork,
  isGroupNetwork,
  openUrl,
  parseDiscordWebhook,
  parseGroupAddress,
  resolveTelegramGroup,
  sendGroupPost,
  sharedTooRecently
} from "./groups.js";
import { writeLearnSite } from "./internet.js";
import { sendGrowthMail } from "./mail.js";
import { applyLink, trackedLink } from "./utm.js";
import { produceItem, pullItem, pullReady } from "./produce.js";
import { retryPublish, runPublish } from "./publish.js";
import { dispatchSlot, type DispatchContext } from "./scheduler.js";
import { nextMondayIso } from "./time.js";
import { applyTrendSettings, readTrendSettings, runTrendNow } from "./youtubeTrends.js";

export type AppCtx = DispatchContext & {
  db: GrowthDb;
  secret: string;
  repoPromo: string;
};

const COOKIE = "growth_session";

function articles(db: GrowthDb) {
  return listItems(db)
    .filter((item) => item.copy.article?.body?.trim())
    .map((item) => ({
      slug: item.slug,
      title: item.copy.article.title || item.title,
      description: item.copy.article.description || item.summary,
      body: item.copy.article.body
    }));
}

export function registerRoutes(app: FastifyInstance, ctx: AppCtx): void {
  app.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith("/api/")) return;
    if (request.url.startsWith("/api/health") || request.url.startsWith("/api/login")) return;
    if (!authorized(request)) return reply.code(401).send({ error: "auth" });
  });

  app.get("/api/health", async () => ({ ok: true }));

  app.post("/api/login", async (request, reply) => {
    const body = request.body as { name?: string; password?: string };
    if (!body.password) return reply.code(401).send({ error: "סיסמה שגויה" });
    if (listOperators(ctx.db).length === 0) return reply.code(503).send({ error: "Set GROWTH_OPERATOR_PASSWORD" });
    const operator = findOperatorByPassword(ctx.db, body.password, verifyPassword, body.name);
    if (!operator) return reply.code(401).send({ error: "סיסמה שגויה" });
    const token = nid() + nid();
    const expires = new Date(Date.now() + 14 * 24 * 3600_000).toISOString();
    createSession(ctx.db, hashToken(token), expires, operator.id);
    reply.setCookie(COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      signed: true,
      secure: ctx.publicBase.startsWith("https://"),
      maxAge: 14 * 24 * 3600
    });
    return { ok: true, name: operator.name };
  });

  app.post("/api/logout", async (request, reply) => {
    const token = readToken(request);
    if (token) deleteSession(ctx.db, hashToken(token));
    reply.clearCookie(COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/api/state", async () => ({
    items: listItems(ctx.db),
    connections: listConnections(ctx.db).map(({ encryptedTokens: _tokens, ...row }) => row),
    destinations: listDestinations(ctx.db),
    slots: listSlots(ctx.db),
    jobs: listJobs(ctx.db),
    directories: listDirectories(ctx.db),
    emails: listEmails(ctx.db),
    networks: ["youtube", "instagram", "facebook", "tiktok", "telegram", "linkedin", ...EXPORT_NETWORKS].map((network) => ({
      network,
      oauth: oauthNetworks().includes(network),
      ...networkSetup(network)
    })),
    settings: {
      emailAutopilot: flag(ctx.db, "email_autopilot"),
      siteAutopilot: flag(ctx.db, "site_autopilot"),
      utmCampaign: getSetting(ctx.db, "utm_campaign"),
      startMonday: getSetting(ctx.db, "start_monday")
    },
    mailConfigured: Boolean(process.env.GROWTH_RESEND_API_KEY && process.env.GROWTH_MAIL_FROM && process.env.GROWTH_MAIL_TO),
    produceConfigured: Boolean(process.env.REELMINO_SESSION),
    operators: listOperators(ctx.db),
    publicBase: ctx.publicBase,
    groupNetworks: GROUP_NETWORKS.map((network) => ({ network, auto: isAutoNetwork(network) })),
    groups: listGroups(ctx.db).map(({ secretEnc: _secret, ...group }) => ({
      ...group,
      auto: isAutoNetwork(group.network),
      tooSoon: sharedTooRecently(group.lastSharedAt, group.minDays)
    })),
    groupPosts: groupPostsView(),
    youtubeTrends: { ...readTrendSettings(ctx.db), cycles: listTrendCycles(ctx.db, 12) }
  }));

  function groupPostsView() {
    const groups = new Map(listGroups(ctx.db).map((group) => [group.id, group]));
    const campaign = getSetting(ctx.db, "utm_campaign") ?? undefined;
    return listGroupPosts(ctx.db).flatMap((post) => {
      const group = groups.get(post.groupId);
      const item = getItem(ctx.db, post.itemId);
      if (!group || !item) return [];
      const text = groupText(group, item, post, campaign);
      return [
        {
          ...post,
          network: group.network,
          groupName: group.name,
          groupRules: group.rules,
          groupMinDays: group.minDays,
          groupLastSharedAt: group.lastSharedAt,
          auto: isAutoNetwork(group.network),
          autopilot: group.autopilot,
          text,
          openUrl: openUrl(group, item, text),
          shareUrl: group.network === "facebook" ? facebookShareUrl(post.facebookPostUrl) : null,
          tooSoon: post.status === "pending" && sharedTooRecently(group.lastSharedAt, group.minDays)
        }
      ];
    });
  }

  const validTrigger = (value: string | undefined): string | null =>
    value && ["any", "youtube", "instagram", "facebook", "tiktok", "telegram", "linkedin"].includes(value) ? value : null;

  const groupContext = () => ({
    db: ctx.db,
    key: ctx.key,
    mediaDir: ctx.mediaDir,
    publicBase: ctx.publicBase,
    campaign: getSetting(ctx.db, "utm_campaign") ?? undefined
  });

  app.post("/api/groups", async (request, reply) => {
    const body = request.body as {
      network?: string;
      address?: string;
      name?: string;
      rules?: string;
      minDays?: number;
      trigger?: string;
      autopilot?: boolean;
    };
    const network = body.network ?? "";
    if (!isGroupNetwork(network)) return reply.code(400).send({ error: "רשת לא נתמכת לקבוצות" });
    let address: { link: string; target: string; name: string } | null;
    let secretEnc: string | null = null;
    if (network === "telegram") {
      try {
        address = await resolveTelegramGroup(groupContext(), body.address ?? "");
      } catch (error) {
        return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
      }
    } else if (network === "discord") {
      const hook = parseDiscordWebhook(body.address ?? "");
      if (!hook) return reply.code(400).send({ error: "כתובת Webhook בפורמט https://discord.com/api/webhooks/..." });
      address = { link: "", target: hook.target, name: "Discord" };
      secretEnc = encryptJson({ url: hook.webhook }, ctx.key);
    } else {
      address = parseGroupAddress(network, body.address ?? "");
      if (!address) return reply.code(400).send({ error: "הכתובת לא נראית כמו קבוצה ברשת הזו" });
    }
    const trigger = validTrigger(body.trigger) ?? (network === "facebook" ? "facebook" : "any");
    try {
      return insertGroup(ctx.db, {
        id: nid(),
        network,
        name: body.name?.trim().slice(0, 80) || address.name,
        link: address.link,
        target: address.target,
        secretEnc,
        rules: body.rules?.trim().slice(0, 500) ?? "",
        minDays: Number.isFinite(body.minDays) ? Math.max(0, Math.round(body.minDays!)) : 7,
        trigger,
        autopilot: isAutoNetwork(network) && body.autopilot === true
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("UNIQUE")) return reply.code(409).send({ error: "הקבוצה כבר ברשימה" });
      throw error;
    }
  });

  app.patch("/api/groups/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { name?: string; rules?: string; minDays?: number; trigger?: string; autopilot?: boolean; enabled?: boolean };
    const current = getGroup(ctx.db, id);
    if (!current) return reply.code(404).send({ error: "not found" });
    return updateGroup(ctx.db, id, {
      ...(body.name?.trim() ? { name: body.name.trim().slice(0, 80) } : {}),
      ...(body.rules !== undefined ? { rules: body.rules.trim().slice(0, 500) } : {}),
      ...(Number.isFinite(body.minDays) ? { minDays: Math.max(0, Math.round(body.minDays!)) } : {}),
      ...(validTrigger(body.trigger) ? { trigger: validTrigger(body.trigger)! } : {}),
      ...(body.autopilot !== undefined ? { autopilot: isAutoNetwork(current.network) && body.autopilot } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {})
    });
  });

  app.delete("/api/groups/:id", async (request) => {
    deleteGroup(ctx.db, (request.params as { id: string }).id);
    return { ok: true };
  });

  app.post("/api/jobs/:id/groups", async (request, reply) => {
    const job = getJob(ctx.db, (request.params as { id: string }).id);
    if (!job || job.status !== "published") return reply.code(400).send({ error: "רק פוסט שפורסם" });
    return { added: queueGroupPosts(ctx.db, { itemId: job.itemId, jobId: job.id, network: job.network }, nid, { force: true }) };
  });

  app.post("/api/jobs/:id/retry", async (request, reply) => {
    const result = await retryPublish({
      db: ctx.db,
      key: ctx.key,
      mediaDir: ctx.mediaDir,
      publicBase: ctx.publicBase,
      jobId: (request.params as { id: string }).id,
      campaign: getSetting(ctx.db, "utm_campaign") ?? undefined
    });
    if (result.error === "not_found") return reply.code(404).send({ error: "not found" });
    if (result.error === "not_failed") return reply.code(400).send({ error: "רק פרסום שנכשל" });
    if (result.error === "no_destination") return reply.code(400).send({ error: "אין יעד לפרסום חוזר" });
    if (result.job?.status === "failed") return reply.code(502).send(result.job);
    return result.job;
  });

  app.post("/api/items/:id/groups", async (request, reply) => {
    const item = getItem(ctx.db, (request.params as { id: string }).id);
    if (!item) return reply.code(404).send({ error: "not found" });
    return { added: queueGroupPosts(ctx.db, { itemId: item.id, jobId: null, network: null }, nid, { force: true }) };
  });

  app.patch("/api/group-posts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { status?: string; postUrl?: string };
    if (body.status !== "done" && body.status !== "skipped") return reply.code(400).send({ error: "status must be done or skipped" });
    if (!getGroupPost(ctx.db, id)) return reply.code(404).send({ error: "not found" });
    const postUrl = body.postUrl?.trim() || null;
    if (postUrl && !/^https:\/\/\S+$/.test(postUrl)) return reply.code(400).send({ error: "קישור https בלבד" });
    return finishGroupPost(ctx.db, id, { status: body.status, postUrl });
  });

  app.post("/api/group-posts/:id/send", async (request, reply) => {
    const post = getGroupPost(ctx.db, (request.params as { id: string }).id);
    if (!post) return reply.code(404).send({ error: "not found" });
    const group = getGroup(ctx.db, post.groupId);
    if (!group || !isAutoNetwork(group.network)) return reply.code(400).send({ error: "ברשת הזו מפרסמים בעצמכם" });
    const result = await sendGroupPost(groupContext(), post.id);
    if (result?.status === "failed") return reply.code(502).send({ error: result.error });
    return result;
  });

  app.post("/api/operators", async (request, reply) => {
    const body = request.body as { name?: string; password?: string };
    const name = body.name?.trim() ?? "";
    const password = body.password ?? "";
    if (!name || name.length > 40) return reply.code(400).send({ error: "צריך שם עד 40 תווים" });
    if (password.length < 8) return reply.code(400).send({ error: "סיסמה של 8 תווים לפחות" });
    try {
      return insertOperator(ctx.db, nid(), name, hashPassword(password));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("UNIQUE")) return reply.code(409).send({ error: "השם כבר קיים" });
      throw error;
    }
  });

  app.delete("/api/operators/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!deleteOperator(ctx.db, id)) return reply.code(400).send({ error: "נשאר לפחות מפעיל אחד" });
    return { ok: true };
  });

  app.post("/api/import/kit", async () => importPromoKit(ctx.db, ctx.repoPromo, ctx.mediaDir));

  app.post("/api/import/calendar", async (request) => {
    const body = request.body as { startMonday?: string };
    const startMonday = body.startMonday || nextMondayIso();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startMonday)) throw Object.assign(new Error("startMonday must be YYYY-MM-DD"), { statusCode: 400 });
    setSetting(ctx.db, "start_monday", startMonday);
    return { startMonday, ...importCalendar(ctx.db, startMonday) };
  });

  app.post("/api/items", async (request, reply) => {
    const body = request.body as { title?: string };
    const title = body.title?.trim();
    if (!title) return reply.code(400).send({ error: "title required" });
    const copy = emptyCopy();
    copy.article = { title, description: title, body: title };
    copy.linkedin = { body: `${title}\n\nhttps://reelmino.com` };
    copy.youtube = { title, body: title };
    const item = insertItem(ctx.db, {
      id: nid(),
      slug: `manual-${slugify(title)}-${nid().slice(0, 4)}`,
      source: "manual",
      title,
      summary: "",
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
    return item;
  });

  app.patch("/api/items/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { title?: string; summary?: string; copy?: ItemCopy };
    const item = updateItem(ctx.db, id, {
      ...(body.title ? { title: body.title } : {}),
      ...(body.summary !== undefined ? { summary: body.summary } : {}),
      ...(body.copy ? { copy: body.copy } : {})
    });
    if (!item) return reply.code(404).send({ error: "not found" });
    return item;
  });

  app.post("/api/items/:id/media", async (request, reply) => {
    const { id } = request.params as { id: string };
    const file = await request.file();
    if (!file) return reply.code(400).send({ error: "file required" });
    const ext = path.extname(file.filename || "").toLowerCase() || ".bin";
    if (![".mp4", ".mov", ".webm", ".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
      return reply.code(400).send({ error: "use mp4, mov, webm, png, jpg or webp" });
    }
    const filename = `${nid()}${ext}`;
    mkdirSync(ctx.mediaDir, { recursive: true });
    const body = await file.toBuffer();
    writeFileSync(path.join(ctx.mediaDir, filename), body);
    const image = [".png", ".jpg", ".jpeg", ".webp"].includes(ext);
    const item = updateItem(ctx.db, id, {
      mediaPath: filename,
      mediaMime: file.mimetype,
      mediaKind: image ? "image" : "video",
      mediaWidth: image ? null : 1080,
      mediaHeight: image ? null : 1920,
      mediaDurationMs: image ? null : 30_000
    });
    if (!item) return reply.code(404).send({ error: "not found" });
    return item;
  });

  app.post("/api/items/:id/produce", async (request, reply) => {
    const item = getItem(ctx.db, (request.params as { id: string }).id);
    if (!item) return reply.code(404).send({ error: "not found" });
    return produceItem(ctx.db, ctx.repoPromo, item);
  });

  app.post("/api/items/:id/pull", async (request, reply) => {
    const item = getItem(ctx.db, (request.params as { id: string }).id);
    if (!item) return reply.code(404).send({ error: "not found" });
    return pullItem(ctx.db, ctx.mediaDir, item);
  });

  app.post("/api/produce/pull", async () => pullReady(ctx.db, ctx.mediaDir));

  app.get("/api/items/:id/export/:network", async (request, reply) => {
    const { id, network } = request.params as { id: string; network: string };
    if (!(EXPORT_NETWORKS as readonly string[]).includes(network)) return reply.code(400).send({ error: "export only" });
    const item = getItem(ctx.db, id);
    if (!item) return reply.code(404).send({ error: "not found" });
    const caption = composeFreshCopy({ item, network, seed: `export:${item.id}:${network}` });
    const link = trackedLink({ network, slug: item.slug, format: "text", campaign: getSetting(ctx.db, "utm_campaign") ?? undefined });
    return {
      network,
      text: applyLink(caption.body || caption.title, link),
      mediaUrl: item.mediaPath ? `/media/${item.mediaPath}` : null
    };
  });

  app.post("/api/publish", async (request, reply) => {
    const body = request.body as { itemId?: string; destinationId?: string };
    const item = body.itemId ? getItem(ctx.db, body.itemId) : null;
    const destination = body.destinationId ? getDestination(ctx.db, body.destinationId) : null;
    if (!item || !destination) return reply.code(400).send({ error: "item and destination required" });
    if (!destination.enabled) return reply.code(400).send({ error: "destination disabled" });
    return runPublish({
      db: ctx.db,
      key: ctx.key,
      mediaDir: ctx.mediaDir,
      publicBase: ctx.publicBase,
      item,
      destination,
      campaign: getSetting(ctx.db, "utm_campaign") ?? undefined
    });
  });

  app.post("/api/schedule", async (request, reply) => {
    const body = request.body as { itemId?: string; destinationId?: string; scheduledFor?: string };
    const item = body.itemId ? getItem(ctx.db, body.itemId) : null;
    const destination = body.destinationId ? getDestination(ctx.db, body.destinationId) : null;
    if (!item || !destination || !body.scheduledFor) return reply.code(400).send({ error: "item, destination and scheduledFor required" });
    const when = new Date(body.scheduledFor);
    if (Number.isNaN(when.getTime())) return reply.code(400).send({ error: "invalid date" });
    const id = nid();
    upsertPlannedSlot(ctx.db, {
      id,
      itemId: item.id,
      network: destination.network,
      destinationId: destination.id,
      scheduledFor: when.toISOString(),
      origin: "manual"
    });
    if (when.getTime() <= Date.now()) {
      const slot = listSlots(ctx.db).find((row) => row.id === id);
      if (slot) await dispatchSlot(ctx, slot);
    }
    return listSlots(ctx.db).find((row) => row.id === id) ?? { id };
  });

  app.post("/api/slots/:id/approve", async (request, reply) => {
    const { id } = request.params as { id: string };
    const slot = listSlots(ctx.db).find((row) => row.id === id);
    if (!slot) return reply.code(404).send({ error: "not found" });
    reopenSlot(ctx.db, id);
    const next = listSlots(ctx.db).find((row) => row.id === id);
    if (next) await dispatchSlot(ctx, next);
    return listSlots(ctx.db).find((row) => row.id === id) ?? { id };
  });

  async function startNetworkConnect(request: FastifyRequest, reply: FastifyReply) {
    const { network } = request.params as { network: string };
    try {
      return await beginOAuth(network, redirectUri(ctx, network), ctx.secret);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  }
  app.post("/api/oauth/:network/start", startNetworkConnect);
  app.post("/api/connect/:network/start", startNetworkConnect);

  app.get("/oauth/:network/callback", async (request, reply) => {
    const { network } = request.params as { network: string };
    const query = request.query as { code?: string; state?: string; error?: string; error_description?: string };
    try {
      const result = await finishOAuth({ db: ctx.db, key: ctx.key, secret: ctx.secret, query, redirectUri: redirectUri(ctx, network) });
      return reply.redirect(`/?connected=${encodeURIComponent(result.network)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "oauth failed";
      return reply.redirect(`/?oauth_error=${encodeURIComponent(message)}`);
    }
  });

  app.post("/api/connections/telegram", async (request, reply) => {
    const body = request.body as { token?: string; chatId?: string };
    if (!body.token?.trim()) return reply.code(400).send({ error: "token required" });
    await connectTelegram(ctx.db, ctx.key, body.token.trim(), body.chatId?.trim());
    return { ok: true, destinations: listDestinations(ctx.db) };
  });

  app.post("/api/connections/:id/sync", async (request) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { chatId?: string };
    const count = await syncConnection(ctx.db, ctx.key, id, body.chatId);
    return { ok: true, count };
  });

  app.delete("/api/connections/:id", async (request) => {
    removeConnection(ctx.db, (request.params as { id: string }).id);
    return { ok: true };
  });

  app.patch("/api/destinations/:id", async (request, reply) => {
    const body = request.body as { autopilot?: boolean; enabled?: boolean };
    const row = setDestinationFlags(ctx.db, (request.params as { id: string }).id, body);
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.patch("/api/youtube-trends", async (request, reply) => {
    const body = (request.body ?? {}) as Partial<{
      enabled: boolean;
      hours: number;
      region: string;
      language: string;
      niche: string;
      destinationId: string | null;
    }>;
    const error = applyTrendSettings(ctx.db, body);
    if (error) return reply.code(400).send({ error });
    return { ...readTrendSettings(ctx.db), cycles: listTrendCycles(ctx.db, 12) };
  });

  app.post("/api/youtube-trends/run", async (_request, reply) => {
    try {
      return await runTrendNow(ctx);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(message.includes("כבר רץ") ? 409 : 400).send({ error: message });
    }
  });

  app.patch("/api/settings", async (request) => {
    const body = request.body as { emailAutopilot?: boolean; siteAutopilot?: boolean; utmCampaign?: string };
    if (body.emailAutopilot !== undefined) setSetting(ctx.db, "email_autopilot", body.emailAutopilot ? "1" : "0");
    if (body.siteAutopilot !== undefined) setSetting(ctx.db, "site_autopilot", body.siteAutopilot ? "1" : "0");
    if (body.utmCampaign !== undefined) setSetting(ctx.db, "utm_campaign", body.utmCampaign);
    return { ok: true };
  });

  app.post("/api/internet/export", async () => {
    const result = writeLearnSite({ publicDir: ctx.webPublic, origin: ctx.origin, articles: articles(ctx.db), sitemapBase: ctx.sitemapBase });
    return result;
  });

  app.patch("/api/directories/:id", async (request, reply) => {
    const body = request.body as { status?: string; draftText?: string; listingUrl?: string | null; notes?: string };
    const row = updateDirectory(ctx.db, (request.params as { id: string }).id, body);
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.post("/api/items/:id/email", async (request, reply) => {
    const item = getItem(ctx.db, (request.params as { id: string }).id);
    if (!item) return reply.code(404).send({ error: "not found" });
    const caption = composeFreshCopy({ item, network: "email", seed: `email:${item.id}:${nid()}` });
    const body = applyLink(caption.body, trackedLink({ network: "email", slug: item.slug, format: "email" }));
    return insertEmail(ctx.db, { id: nid(), itemId: item.id, subject: caption.title || item.title, body });
  });

  app.post("/api/emails/:id/send", async (request, reply) => {
    const email = getEmail(ctx.db, (request.params as { id: string }).id);
    if (!email) return reply.code(404).send({ error: "not found" });
    const to = process.env.GROWTH_MAIL_TO?.trim();
    if (!to) return reply.code(400).send({ error: "Set GROWTH_MAIL_TO" });
    try {
      await sendGrowthMail({ to, subject: email.subject, text: email.body });
      return updateEmail(ctx.db, email.id, { status: "sent", sentAt: new Date().toISOString(), lastError: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(502).send(updateEmail(ctx.db, email.id, { status: "failed", lastError: message }));
    }
  });

  function authorized(request: FastifyRequest): boolean {
    const token = readToken(request);
    if (!token) return false;
    return sessionValid(ctx.db, hashToken(token), new Date().toISOString());
  }

  function readToken(request: FastifyRequest): string | null {
    const raw = request.cookies[COOKIE];
    if (!raw) return null;
    const unsigned = request.unsignCookie(raw);
    return unsigned.valid && unsigned.value ? unsigned.value : null;
  }
}

function redirectUri(ctx: AppCtx, network: string): string {
  return `${ctx.publicBase.replace(/\/$/, "")}/oauth/${network}/callback`;
}

export function sendMedia(reply: FastifyReply, mediaDir: string, filename: string, range?: string): FastifyReply {
  const file = path.join(mediaDir, filename);
  if (!/^[a-f0-9]+\.(mp4|mov|webm|png|jpg|jpeg|webp)$/i.test(filename) || !existsSync(file)) {
    return reply.code(404).send({ error: "not found" });
  }
  const size = statSync(file).size;
  const type = filename.endsWith(".png")
    ? "image/png"
    : filename.endsWith(".webp")
      ? "image/webp"
      : filename.endsWith(".jpg") || filename.endsWith(".jpeg")
        ? "image/jpeg"
        : "video/mp4";
  reply.type(type).header("accept-ranges", "bytes");
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (match && (match[1] || match[2])) {
    const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (start >= size || start > end) return reply.code(416).header("content-range", `bytes */${size}`).send();
    return reply
      .code(206)
      .header("content-range", `bytes ${start}-${end}/${size}`)
      .header("content-length", end - start + 1)
      .send(createReadStream(file, { start, end }));
  }
  return reply.header("content-length", size).send(createReadStream(file));
}

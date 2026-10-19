import "@fastify/cookie";
import "@fastify/multipart";
import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { beginOAuth, connectTelegram, finishOAuth, networkSetup, oauthNetworks, removeConnection, syncConnection } from "./accounts.js";
import { importCalendar, importPromoKit, slugify } from "./catalog.js";
import { emptyCopy, EXPORT_NETWORKS, networkText, type ItemCopy } from "./copy.js";
import { hashPassword, hashToken, nid, verifyPassword } from "./crypto.js";
import {
  createSession,
  deleteOperator,
  deleteSession,
  findOperatorByPassword,
  flag,
  insertOperator,
  listOperators,
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
import { writeLearnSite } from "./internet.js";
import { sendGrowthMail } from "./mail.js";
import { applyLink, trackedLink } from "./utm.js";
import { produceItem, pullItem, pullReady } from "./produce.js";
import { runPublish } from "./publish.js";
import { dispatchSlot, type DispatchContext } from "./scheduler.js";
import { nextMondayIso } from "./time.js";

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
    publicBase: ctx.publicBase
  }));

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
    const text = networkText(item.copy, network);
    const link = trackedLink({ network, slug: item.slug, format: "text", campaign: getSetting(ctx.db, "utm_campaign") ?? undefined });
    return {
      network,
      text: applyLink(text.body || text.title, link),
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

  app.post("/api/oauth/:network/start", async (request, reply) => {
    const { network } = request.params as { network: string };
    try {
      return await beginOAuth(network, redirectUri(ctx, network), ctx.secret);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

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

  app.patch("/api/settings", async (request) => {
    const body = request.body as { emailAutopilot?: boolean; siteAutopilot?: boolean; utmCampaign?: string };
    if (body.emailAutopilot !== undefined) setSetting(ctx.db, "email_autopilot", body.emailAutopilot ? "1" : "0");
    if (body.siteAutopilot !== undefined) setSetting(ctx.db, "site_autopilot", body.siteAutopilot ? "1" : "0");
    if (body.utmCampaign !== undefined) setSetting(ctx.db, "utm_campaign", body.utmCampaign);
    return { ok: true };
  });

  app.post("/api/internet/export", async () => {
    const result = writeLearnSite({ publicDir: ctx.webPublic, origin: ctx.origin, articles: articles(ctx.db) });
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
    const text = networkText(item.copy, "email");
    const body = applyLink(text.body, trackedLink({ network: "email", slug: item.slug, format: "email" }));
    return insertEmail(ctx.db, { id: nid(), itemId: item.id, subject: text.subject || item.title, body });
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

export function sendMedia(reply: FastifyReply, mediaDir: string, filename: string): void {
  if (!/^[a-f0-9]+\.(mp4|mov|webm|png|jpg|jpeg|webp)$/i.test(filename)) {
    reply.code(404).send({ error: "not found" });
    return;
  }
  const file = path.join(mediaDir, filename);
  const type = filename.endsWith(".png")
    ? "image/png"
    : filename.endsWith(".webp")
      ? "image/webp"
      : filename.endsWith(".jpg") || filename.endsWith(".jpeg")
        ? "image/jpeg"
        : "video/mp4";
  reply.type(type).send(createReadStream(file));
}

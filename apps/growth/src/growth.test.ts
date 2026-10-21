import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assetKind, CALENDAR, networksForKind } from "./calendar.js";
import { importCalendar, importPromoKit } from "./catalog.js";
import { signPayload, verifyPayload } from "./crypto.js";
import { insertJob, listGroups, migrate, openDb, queueGroupPosts, updateJob } from "./db.js";
import { deliverDueGroupPosts, normalizeGroupUrl, parseDiscordWebhook, parseGroupAddress, sharedTooRecently } from "./groups.js";
import { renderArticle, spliceSitemap, writeLearnSite } from "./internet.js";
import { linkedinPostBody } from "./linkedin.js";
import { decideSlot } from "./schedule.js";
import { buildApp } from "./server.js";
import { nextMondayIso, zonedToUtc } from "./time.js";
import { applyLink, trackedLink } from "./utm.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "growth-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("growth console", () => {
  it("tracks organic links and keeps an existing url", () => {
    const link = trackedLink({ network: "instagram", slug: "kit-00-hero", format: "v9x16", now: new Date("2026-10-15T00:00:00Z"), campaign: "202610-smb-us-demo" });
    const url = new URL(link);
    expect(url.searchParams.get("utm_source")).toBe("instagram");
    expect(url.searchParams.get("utm_medium")).toBe("organic");
    expect(url.searchParams.get("utm_campaign")).toBe("202610-smb-us-demo");
    expect(url.searchParams.get("utm_content")).toBe("kit-00-hero-outcome-v9x16-a");
    expect(applyLink("See https://reelmino.com today", link)).toContain("utm_source=instagram");
    expect(applyLink("Already https://reelmino.com/?utm_source=keep", link)).toContain("utm_source=keep");
  });

  it("places Jerusalem wall time on the right UTC instant", () => {
    expect(zonedToUtc(2026, 10, 19, 9, 0, "Asia/Jerusalem").toISOString()).toBe("2026-10-19T06:00:00.000Z");
    expect(zonedToUtc(2026, 11, 2, 9, 0, "Asia/Jerusalem").toISOString()).toBe("2026-11-02T07:00:00.000Z");
    expect(nextMondayIso(new Date("2026-10-15T12:00:00Z"))).toBe("2026-10-19");
  });

  it("classifies the 90-day calendar without paid placements", () => {
    expect(CALENDAR).toHaveLength(13);
    expect(CALENDAR.reduce((sum, week) => sum + week.assets.length, 0)).toBe(65);
    expect(assetKind("LinkedIn: how to price AI-video production sustainably.")).toBe("linkedin");
    expect(assetKind("Email: Why we built Reelmino.")).toBe("email");
    expect(assetKind("YouTube tutorial: complete agency workflow.")).toBe("youtube");
    expect(assetKind("Case-study page in the winning secondary language.")).toBe("article");
    expect(assetKind("Webinar invitation.")).toBe("email");
    expect(networksForKind("short")).toEqual(["youtube", "instagram", "facebook", "tiktok", "telegram"]);
  });

  it("keeps manual posts approved and calendar posts in review until autopilot is on", () => {
    expect(decideSlot({ network: "youtube", origin: "calendar", destination: { enabled: true, autopilot: false }, emailAutopilot: false, siteAutopilot: false })).toBe("needs_review");
    expect(decideSlot({ network: "youtube", origin: "calendar", destination: { enabled: true, autopilot: true }, emailAutopilot: false, siteAutopilot: false })).toBe("publish");
    expect(decideSlot({ network: "youtube", origin: "manual", destination: { enabled: true, autopilot: false }, emailAutopilot: false, siteAutopilot: false })).toBe("publish");
    expect(decideSlot({ network: "youtube", origin: "calendar", destination: { enabled: false, autopilot: true }, emailAutopilot: false, siteAutopilot: false })).toBe("skipped");
    expect(decideSlot({ network: "email", origin: "calendar", destination: null, emailAutopilot: false, siteAutopilot: false })).toBe("needs_review");
    expect(decideSlot({ network: "site", origin: "calendar", destination: null, emailAutopilot: false, siteAutopilot: true })).toBe("publish");
  });

  it("signs oauth state and builds a linkedin post", () => {
    const token = signPayload({ network: "youtube", exp: Date.now() + 1000 }, "secret");
    expect(verifyPayload<{ network: string }>(token, "secret").network).toBe("youtube");
    expect(() => verifyPayload(token, "other")).toThrow();
    const body = linkedinPostBody("urn:li:person:1", "Hello Reelmino", "urn:li:image:2");
    expect(body.author).toBe("urn:li:person:1");
    expect(body.commentary).toBe("Hello Reelmino");
    expect(body.content).toEqual({ media: { id: "urn:li:image:2" } });
  });

  it("imports the promo kit and the calendar into its own database", async () => {
    const dir = tempDir();
    const db = openDb(path.join(dir, "growth.sqlite"));
    const kit = await importPromoKit(db, path.join(repoRoot, "marketing/promo-kit"), path.join(dir, "media"));
    expect(kit.imported).toBe(18);
    const calendar = importCalendar(db, "2026-10-19");
    expect(calendar.items).toBe(69);
    expect(calendar.slots).toBeGreaterThan(65);
    db.close();
  });

  it("writes learn pages and splices the sitemap", () => {
    const dir = tempDir();
    const publicDir = path.join(dir, "public");
    mkdirSync(publicDir, { recursive: true });
    writeFileSync(path.join(publicDir, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://reelmino.com/</loc></url>\n</urlset>\n`);
    const html = renderArticle({ slug: "one", title: "A & B", description: "desc", body: "Line\n\n<script>" }, "https://reelmino.com/learn/one/");
    expect(html).toContain("A &amp; B");
    expect(html).toContain("<p>&lt;script&gt;</p>");
    expect(html).not.toContain("<p><script></p>");
    expect(html).toContain("googletagmanager.com/gtag/js?id=G-JX95ZGHQ6Z");
    const written = writeLearnSite({
      publicDir,
      origin: "https://reelmino.com",
      articles: [{ slug: "one", title: "One", description: "desc", body: "Hello" }]
    });
    expect(written.count).toBe(1);
    expect(readFileSync(path.join(publicDir, "learn/one/index.html"), "utf8")).toContain("Hello");
    const sitemap = readFileSync(path.join(publicDir, "sitemap.xml"), "utf8");
    expect(sitemap).toContain("https://reelmino.com/");
    expect(sitemap).toContain("https://reelmino.com/learn/one/");
    expect(spliceSitemap(sitemap, ["https://reelmino.com/learn/two/"])).not.toContain("/learn/one/");
    const volume = path.join(dir, "volume");
    writeLearnSite({
      publicDir: volume,
      origin: "https://reelmino.com",
      articles: [{ slug: "two", title: "Two", description: "desc", body: "Hi" }],
      sitemapBase: path.join(publicDir, "sitemap.xml")
    });
    const shared = readFileSync(path.join(volume, "sitemap.xml"), "utf8");
    expect(shared).toContain("<loc>https://reelmino.com/</loc>");
    expect(shared).toContain("/learn/two/");
    expect(shared.match(/growth:learn:start/g)).toHaveLength(1);
  });

  it("requires the operator password and then shows imported content", async () => {
    process.env.GROWTH_OPERATOR_PASSWORD = "secret";
    process.env.GROWTH_DISABLE_SCHEDULER = "1";
    const dir = tempDir();
    const built = await buildApp({
      dataDir: dir,
      webPublic: path.join(dir, "public"),
      promoKit: path.join(repoRoot, "marketing/promo-kit"),
      listen: false
    });
    const denied = await built.app.inject({ method: "GET", url: "/api/state" });
    expect(denied.statusCode).toBe(401);
    const login = await built.app.inject({ method: "POST", url: "/api/login", payload: { password: "secret" } });
    expect(login.statusCode).toBe(200);
    const setCookie = login.headers["set-cookie"];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)!.split(";")[0]!;
    const imported = await built.app.inject({ method: "POST", url: "/api/import/kit", headers: { cookie }, payload: {} });
    expect(imported.statusCode).toBe(200);
    const state = await built.app.inject({ method: "GET", url: "/api/state", headers: { cookie } });
    expect(state.statusCode).toBe(200);
    const body = state.json() as { items: unknown[]; directories: unknown[]; networks: Array<{ network: string }> };
    expect(body.items).toHaveLength(18);
    expect(body.directories).toHaveLength(5);
    expect(body.networks.map((row) => row.network)).toContain("linkedin");
    expect(body.networks.map((row) => row.network)).toContain("x");
    const page = await built.app.inject({ method: "GET", url: "/" });
    expect(page.body).toContain("מערך שיווק אורגני");
    const added = await built.app.inject({
      method: "POST",
      url: "/api/operators",
      headers: { cookie },
      payload: { name: "Dana", password: "second-pass" }
    });
    expect(added.statusCode).toBe(200);
    const wrong = await built.app.inject({ method: "POST", url: "/api/login", payload: { name: "Dana", password: "secret" } });
    expect(wrong.statusCode).toBe(401);
    const second = await built.app.inject({ method: "POST", url: "/api/login", payload: { name: "Dana", password: "second-pass" } });
    expect(second.statusCode).toBe(200);
    const short = await built.app.inject({
      method: "POST",
      url: "/api/operators",
      headers: { cookie },
      payload: { name: "Short", password: "tiny" }
    });
    expect(short.statusCode).toBe(400);
    await built.close();
  });

  it("serves media files whole and by byte range for network fetchers", async () => {
    process.env.GROWTH_DISABLE_SCHEDULER = "1";
    const dir = tempDir();
    mkdirSync(path.join(dir, "media"), { recursive: true });
    writeFileSync(path.join(dir, "media", "abc123.mp4"), Buffer.from("0123456789"));
    const built = await buildApp({ dataDir: dir, webPublic: path.join(dir, "public"), promoKit: path.join(repoRoot, "marketing/promo-kit"), listen: false });
    const whole = await built.app.inject({ method: "GET", url: "/media/abc123.mp4" });
    expect(whole.statusCode).toBe(200);
    expect(whole.headers["content-length"]).toBe("10");
    expect(whole.body).toBe("0123456789");
    const part = await built.app.inject({ method: "GET", url: "/media/abc123.mp4", headers: { range: "bytes=2-4" } });
    expect(part.statusCode).toBe(206);
    expect(part.headers["content-range"]).toBe("bytes 2-4/10");
    expect(part.body).toBe("234");
    expect((await built.app.inject({ method: "GET", url: "/media/missing1.mp4" })).statusCode).toBe(404);
    await built.close();
  });

  it("accepts only real group addresses for each network", () => {
    expect(normalizeGroupUrl("https://m.facebook.com/groups/reelmino.club/?ref=share")).toBe("https://www.facebook.com/groups/reelmino.club");
    expect(normalizeGroupUrl("https://www.facebook.com/reelmino")).toBeNull();
    expect(normalizeGroupUrl("http://facebook.com/groups/x")).toBeNull();
    expect(parseGroupAddress("linkedin", "https://www.linkedin.com/groups/1234567/")?.link).toBe("https://www.linkedin.com/groups/1234567/");
    expect(parseGroupAddress("linkedin", "https://www.linkedin.com/company/reelmino")).toBeNull();
    expect(parseGroupAddress("whatsapp", "https://chat.whatsapp.com/AbCdEf1234567890")?.link).toBe("https://chat.whatsapp.com/AbCdEf1234567890");
    expect(parseGroupAddress("reddit", "https://old.reddit.com/r/VideoEditing/")?.name).toBe("r/VideoEditing");
    expect(parseGroupAddress("x", "https://twitter.com/i/communities/1500000000000000000")?.link).toBe("https://x.com/i/communities/1500000000000000000");
    expect(parseGroupAddress("telegram", "@group")).toBeNull();
    expect(parseDiscordWebhook("https://discordapp.com/api/webhooks/123/abc-DEF_9")).toEqual({
      target: "webhook:123",
      webhook: "https://discord.com/api/webhooks/123/abc-DEF_9"
    });
    expect(parseDiscordWebhook("https://example.com/api/webhooks/123/abc")).toBeNull();
    expect(sharedTooRecently(new Date(Date.now() - 2 * 86400000).toISOString(), 7)).toBe(true);
    expect(sharedTooRecently(new Date(Date.now() - 8 * 86400000).toISOString(), 7)).toBe(false);
  });

  it("moves facebook groups from the first version into the shared group list", () => {
    const db = openDb(path.join(tempDir(), "growth.sqlite"));
    db.exec(`
      CREATE TABLE fb_groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL UNIQUE, rules TEXT NOT NULL DEFAULT '',
        min_days INTEGER NOT NULL DEFAULT 7, enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
      CREATE TABLE group_shares (id TEXT PRIMARY KEY, group_id TEXT NOT NULL, job_id TEXT NOT NULL, item_id TEXT NOT NULL,
        status TEXT NOT NULL, post_url TEXT, created_at TEXT NOT NULL, done_at TEXT, UNIQUE(group_id, job_id));
      INSERT INTO fb_groups VALUES ('g1', 'Creators', 'https://www.facebook.com/groups/creators', 'Fridays', 5, 1, '2026-10-21T00:00:00Z');
    `);
    migrate(db);
    const [group] = listGroups(db);
    expect(group).toMatchObject({ network: "facebook", name: "Creators", rules: "Fridays", minDays: 5, trigger: "facebook" });
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'fb_groups'").get()).toBeUndefined();
    db.close();
  });

  it("queues every published item once per group and auto-sends only through the owner's webhook", async () => {
    process.env.GROWTH_OPERATOR_PASSWORD = "secret";
    process.env.GROWTH_DISABLE_SCHEDULER = "1";
    const dir = tempDir();
    const built = await buildApp({ dataDir: dir, webPublic: path.join(dir, "public"), promoKit: path.join(repoRoot, "marketing/promo-kit"), listen: false });
    const login = await built.app.inject({ method: "POST", url: "/api/login", payload: { password: "secret" } });
    const setCookie = login.headers["set-cookie"];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)!.split(";")[0]!;
    const call = (method: "GET" | "POST" | "PATCH", url: string, payload?: object) =>
      built.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });

    await call("POST", "/api/import/kit", {});
    expect((await call("POST", "/api/groups", { network: "facebook", address: "https://www.facebook.com/reelmino" })).statusCode).toBe(400);
    expect((await call("POST", "/api/groups", { network: "facebook", name: "Creators", address: "https://www.facebook.com/groups/creators" })).statusCode).toBe(200);
    expect((await call("POST", "/api/groups", { network: "facebook", address: "https://m.facebook.com/groups/creators/" })).statusCode).toBe(409);
    expect((await call("POST", "/api/groups", { network: "reddit", address: "https://www.reddit.com/r/VideoEditing/", trigger: "any" })).statusCode).toBe(200);
    const hook = await call("POST", "/api/groups", { network: "discord", name: "Agency club", address: "https://discord.com/api/webhooks/42/secret-token", autopilot: true });
    expect(hook.statusCode).toBe(200);
    expect(JSON.stringify(hook.json())).not.toContain("secret-token");
    expect((await call("POST", "/api/groups", { network: "telegram", address: "@nobot" })).statusCode).toBe(400);

    const [first, second] = built.db.prepare("SELECT id FROM items ORDER BY slug LIMIT 2").all() as Array<{ id: string }>;
    const youtube = insertJob(built.db, { id: "job-yt", itemId: first!.id, destinationId: null, slotId: null, network: "youtube", status: "queued" });
    updateJob(built.db, youtube.id, { status: "published", remoteUrl: "https://youtu.be/1" });
    expect(queueGroupPosts(built.db, { itemId: first!.id, jobId: youtube.id, network: "youtube" }, () => crypto.randomUUID())).toBe(2);
    const facebook = insertJob(built.db, { id: "job-fb", itemId: first!.id, destinationId: null, slotId: null, network: "facebook", status: "queued" });
    updateJob(built.db, facebook.id, { status: "published", remoteUrl: "https://www.facebook.com/reelmino/posts/1" });
    expect((await call("POST", `/api/jobs/${facebook.id}/groups`, {})).json()).toEqual({ added: 1 });
    expect((await call("POST", `/api/jobs/${facebook.id}/groups`, {})).json()).toEqual({ added: 0 });

    type Post = { id: string; network: string; groupName: string; status: string; text: string; openUrl: string; shareUrl: string | null; auto: boolean };
    const posts = ((await call("GET", "/api/state")).json() as { groupPosts: Post[] }).groupPosts;
    expect(posts).toHaveLength(3);
    const fb = posts.find((row) => row.network === "facebook")!;
    expect(fb.text).toContain("https://www.facebook.com/reelmino/posts/1");
    expect(fb.text).toContain("utm_medium=community");
    expect(fb.text).toContain("utm_term=creators");
    expect(fb.shareUrl).toContain("sharer.php");
    expect(posts.find((row) => row.network === "reddit")!.openUrl).toContain("/r/VideoEditing/submit?type=TEXT");
    expect((await call("PATCH", `/api/group-posts/${fb.id}`, { status: "done", postUrl: "https://www.facebook.com/groups/creators/posts/9" })).statusCode).toBe(200);
    expect((await call("POST", `/api/group-posts/${fb.id}/send`, {})).statusCode).toBe(400);

    const sent: Array<{ url: string; body: { content: string } }> = [];
    vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
      sent.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ id: "m1" }), { status: 200 });
    });
    try {
      const groupCtx = { db: built.db, key: built.ctx.key, mediaDir: path.join(dir, "media"), publicBase: "http://localhost" };
      expect(await deliverDueGroupPosts(groupCtx)).toBe(1);
      expect(sent[0]!.url).toBe("https://discord.com/api/webhooks/42/secret-token?wait=true");
      expect(sent[0]!.body.content).toContain("utm_source=discord");
      await call("POST", `/api/items/${second!.id}/groups`, {});
      expect(await deliverDueGroupPosts(groupCtx)).toBe(0);
      expect(sent).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
    await built.close();
  });
});

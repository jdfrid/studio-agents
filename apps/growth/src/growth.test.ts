import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { assetKind, CALENDAR, networksForKind } from "./calendar.js";
import { importCalendar, importPromoKit } from "./catalog.js";
import { signPayload, verifyPayload } from "./crypto.js";
import { openDb } from "./db.js";
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
    expect(html).not.toContain("<script>");
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
});

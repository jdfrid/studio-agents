/**
 * Sends every promo package to Reelmino and downloads the finished videos.
 *
 *   node marketing/promo-kit/produce.mjs --dry-run         # show what would be sent, no cost
 *   node marketing/promo-kit/produce.mjs                   # create all videos (40 credits each)
 *   node marketing/promo-kit/produce.mjs --only=00,03      # just some packages
 *   node marketing/promo-kit/produce.mjs --status          # check progress, download finished videos
 *
 * Auth: REELMINO_SESSION env var (the studio_session cookie value).
 * Progress is kept in output/produced.json, so re-running never creates a package twice.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { PACKAGES } from "./packages.mjs";

const API = process.env.REELMINO_API ?? "https://reelmino.com/api";
const ROOT = new URL("./", import.meta.url);
const OUTPUT = new URL("output/", ROOT);
const STATE_FILE = new URL("produced.json", OUTPUT);
const CREDITS_PER_VIDEO = 40;
const MAX_SCREENS = 6;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const statusOnly = args.includes("--status");
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = onlyArg ? new Set(onlyArg.slice(7).split(",")) : null;

const session = process.env.REELMINO_SESSION?.trim();
if (!session && !dryRun) {
  console.error("Set REELMINO_SESSION to your studio_session cookie first.");
  process.exit(1);
}
const headers = { cookie: `studio_session=${session}`, "content-type": "application/json" };

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

async function dataUrl(relPath, mimeType) {
  const buf = await readFile(new URL(relPath, ROOT));
  return `data:${mimeType};base64,${buf.toString("base64")}`;
}

function screensOf(pkg) {
  const files = pkg.shots
    .flatMap((s) => s[1].split("→").map((a) => a.trim()))
    // Full-page captures (e.g. 1170x7296) make HeyGen fail with generation_failed.
    .filter((a) => a.startsWith("screens/") && a.endsWith(".png") && !a.includes("-full"));
  return [...new Set(files)].slice(0, MAX_SCREENS);
}

function briefFor(pkg) {
  const narration = pkg.shots
    .filter((s) => s[3])
    .map((s, i) => `Scene ${i + 1} (${s[0]}): "${s[3]}" — on-screen text: ${s[4]}`)
    .join("\n");
  return {
    title: `Reelmino promo ${pkg.id} — ${pkg.name}`,
    sourceText: [
      `A 30-second vertical social ad for Reelmino, an app that turns a one-sentence idea into a finished branded 30-second business video.`,
      `Feature in this ad: ${pkg.feature}.`,
      `What it does: ${pkg.description}`,
      `Audience: ${pkg.audience}.`,
      `Hook: ${pkg.hook}`,
      `Key message: ${pkg.message}`,
      `Use this narration and on-screen text, scene by scene:\n${narration}`,
      `Platform: TikTok, Instagram Reels and YouTube Shorts.`
    ].join("\n"),
    instructions: [
      "The attached images are real screenshots of the Reelmino mobile app. Show them inside a modern smartphone held by a person, or as a clean phone mockup, so the interface stays readable.",
      "Do not invent other app interfaces. Keep the narration exactly as written.",
      "End on the Reelmino end card with reelmino.com."
    ].join("\n"),
    targetAudience: pkg.audience,
    language: "en",
    durationSeconds: 30,
    aspectRatio: "9:16",
    budgetMode: true,
    approvalMode: "auto",
    creative: {
      language: "English",
      videoOrientation: "portrait",
      voiceCharacter: "female_warm",
      karaokeCaptions: "on",
      preferHeygenDub: "off"
    },
    branding: {
      businessName: "Reelmino",
      slogan: "Your story. Now in motion.",
      websiteUrl: "https://reelmino.com",
      primaryColor: "#173D35",
      secondaryColor: "#F6F7F2"
    }
  };
}

async function loadState() {
  if (!existsSync(STATE_FILE)) return {};
  return JSON.parse(await readFile(STATE_FILE, "utf8"));
}

async function saveState(state) {
  await mkdir(OUTPUT, { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

async function downloadFinal(runId, file) {
  const artifacts = await api(`/runs/${runId}/artifacts`);
  const list = Array.isArray(artifacts) ? artifacts : (artifacts.artifacts ?? []);
  const final = list.filter((a) => a.kind === "final_video").at(-1);
  if (!final) return false;
  const signed = await api(`/artifacts/${final.id}/signed-url`);
  const buf = Buffer.from(await fetch(signed.url ?? signed.signedUrl).then((r) => r.arrayBuffer()));
  await writeFile(new URL(file, OUTPUT), buf);
  return true;
}

async function status(state) {
  for (const pkg of PACKAGES) {
    const entry = state[pkg.id];
    if (!entry || (only && !only.has(pkg.id))) continue;
    const file = `${pkg.id}-${pkg.slug}.mp4`;
    if (entry.file && existsSync(new URL(file, OUTPUT))) {
      console.log(`${pkg.id} ${pkg.slug.padEnd(30)} ${"COMPLETED".padEnd(18)} ${entry.file}`);
      continue;
    }
    try {
      const run = await api(`/runs/${entry.runId}`);
      entry.status = run.status;
      if (run.status === "COMPLETED" && (await downloadFinal(entry.runId, file))) entry.file = `output/${file}`;
    } catch (err) {
      console.warn(`${pkg.id} check failed, will retry next time: ${err.message.slice(0, 80)}`);
      continue;
    }
    console.log(`${pkg.id} ${pkg.slug.padEnd(30)} ${entry.status.padEnd(18)} ${entry.file ?? ""}`);
  }
  await saveState(state);
}

const state = await loadState();
const todo = PACKAGES.filter((p) => (!only || only.has(p.id)) && !state[p.id]);

if (statusOnly) {
  await status(state);
  process.exit(0);
}

if (dryRun) {
  for (const pkg of todo) {
    const brief = briefFor(pkg);
    console.log(`\n=== ${pkg.id} ${pkg.name}\nscreens: ${screensOf(pkg).join(", ")}\n${brief.sourceText}`);
  }
  console.log(`\n${todo.length} videos · one free video or ${CREDITS_PER_VIDEO} credits each`);
  process.exit(0);
}

const me = await api("/auth/me");
const free = me.freeVideosRemaining ?? 0;
const paidVideos = Math.max(0, todo.length - free);
const needed = paidVideos * CREDITS_PER_VIDEO;
console.log(`Balance: ${free} free videos + ${me.credits} credits · ${todo.length} videos need ${needed} credits after free videos`);
if (me.credits < needed) {
  console.error("Not enough credits. Add credits, or use --only= for fewer packages.");
  process.exit(1);
}

const logo = await dataUrl("brand/logo-primary.png", "image/png");
for (const pkg of todo) {
  const brief = briefFor(pkg);
  brief.attachments = [
    { name: "reelmino-logo.png", mimeType: "image/png", kind: "image", role: "logo", dataUrl: logo },
    ...(await Promise.all(
      screensOf(pkg).map(async (file) => ({
        name: file.split("/").pop(),
        mimeType: "image/png",
        kind: "image",
        role: "product",
        dataUrl: await dataUrl(file, "image/png")
      }))
    ))
  ];
  const run = await api("/runs", { method: "POST", body: JSON.stringify({ brief }) });
  state[pkg.id] = { runId: run.id, createdAt: new Date().toISOString(), status: run.status };
  await saveState(state);
  console.log(`${pkg.id} ${pkg.slug.padEnd(30)} started  https://reelmino.com/runs/${run.id}`);
}
console.log("\nVideos take a few minutes each. Run with --status to check progress and download them.");

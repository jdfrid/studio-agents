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
 * Packages that use demo/ footage need `node demos.mjs --status` to have finished first.
 */
import { existsSync } from "node:fs";
import { PACKAGES } from "./packages.mjs";
import {
  BRANDING,
  ROOT,
  checkBalance,
  createApi,
  dataUrl,
  downloadFinal,
  loadState,
  requireSession,
  saveState
} from "./lib.mjs";

const OUTPUT = new URL("output/", ROOT);
const STATE_FILE = new URL("produced.json", OUTPUT);
/** Each scene is one ~6s HeyGen beat. Briefs of 20s+ reserve END_CARD_SECONDS for the branded end card. */
const SECONDS_PER_SCENE = 6;
const END_CARD_SECONDS = 6;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const statusOnly = args.includes("--status");
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = onlyArg ? new Set(onlyArg.slice(7).split(",")) : null;

/** Generated scenes only: the end card is added by the renderer and .mp4 rows are spliced via pkg.insert. */
const scenesOf = (pkg) => pkg.shots.filter((s) => s[1] !== "END CARD" && !s[1].endsWith(".mp4"));

/** One still per scene, in scene order (full-page captures make HeyGen fail with generation_failed). */
function imagesOf(pkg) {
  return scenesOf(pkg).map((s) => {
    const file = s[1].split("→")[0].trim();
    if (!/^(screens|demo)\/.+\.png$/.test(file) || file.includes("-full")) {
      throw new Error(`${pkg.id}: scene asset must be a screens/ or demo/ PNG, got "${s[1]}"`);
    }
    return file;
  });
}

function briefFor(pkg) {
  const scenes = scenesOf(pkg);
  const endLine = pkg.shots.find((s) => s[1] === "END CARD")?.[3];
  const narration = scenes
    .map((s, i) => `Scene ${i + 1}: narration "${s[3]}" — on-screen text: ${s[4]} — visual: attached image ${i + 1} (${s[2]})`)
    .join("\n");
  return {
    title: `Reelmino promo ${pkg.id} — ${pkg.name}`,
    sourceText: [
      `A short vertical social ad for Reelmino, an app that turns a one-sentence idea into a finished branded business video.`,
      `Feature in this ad: ${pkg.feature}.`,
      `What it does: ${pkg.description}`,
      `Audience: ${pkg.audience}.`,
      `Exactly ${scenes.length} scenes of about ${SECONDS_PER_SCENE} seconds. Use this narration and on-screen text, scene by scene:\n${narration}`,
      endLine ? `Closing line on the end card: "${endLine}"` : "",
      `Platform: TikTok, Instagram Reels and YouTube Shorts.`
    ]
      .filter(Boolean)
      .join("\n"),
    instructions: [
      `Use exactly ${scenes.length} scenes, one attached image per scene, in the order given.`,
      "Images of the app are real Reelmino screenshots: show them inside a modern smartphone held by a person, or as a clean phone mockup, so the interface stays readable.",
      "Images that are not app screens are real videos made with Reelmino: show them full screen, as they are.",
      "Speak each scene's narration exactly as written — one short sentence per scene. Do not invent other app interfaces."
    ].join("\n"),
    targetAudience: pkg.audience,
    language: "en",
    durationSeconds: scenes.length * SECONDS_PER_SCENE + END_CARD_SECONDS,
    aspectRatio: "9:16",
    budgetMode: true,
    approvalMode: "auto",
    creative: {
      language: "English",
      videoOrientation: "portrait",
      voiceCharacter: "female_warm",
      karaokeCaptions: "on",
      preferHeygenDub: "off",
      ...(pkg.creative ?? {})
    },
    branding: BRANDING
  };
}

async function attachmentsFor(pkg, logo) {
  const list = [
    { name: "reelmino-logo.png", mimeType: "image/png", kind: "image", role: "logo", dataUrl: logo },
    ...(await Promise.all(
      imagesOf(pkg).map(async (file) => ({
        name: file.split("/").pop(),
        mimeType: "image/png",
        kind: "image",
        role: "product",
        dataUrl: await dataUrl(file, "image/png")
      }))
    ))
  ];
  if (pkg.insert) {
    list.push({
      name: pkg.insert.file.split("/").pop(),
      mimeType: "video/mp4",
      kind: "video",
      role: "insert_clip",
      insertAtSeconds: pkg.insert.at,
      audioSource: pkg.insert.audio ?? "clip",
      dataUrl: await dataUrl(pkg.insert.file, "video/mp4")
    });
  }
  return list;
}

function missingFootage(pkg) {
  const files = [...imagesOf(pkg), ...(pkg.insert ? [pkg.insert.file] : [])];
  return files.filter((f) => !existsSync(new URL(f, ROOT)));
}

const state = await loadState(STATE_FILE);
const todo = PACKAGES.filter((p) => (!only || only.has(p.id)) && !state[p.id]);

if (dryRun) {
  for (const pkg of todo) {
    const brief = briefFor(pkg);
    const missing = missingFootage(pkg);
    console.log(
      `\n=== ${pkg.id} ${pkg.name} (${brief.durationSeconds}s incl. end card${pkg.insert ? ` + ${pkg.insert.file} @${pkg.insert.at}s` : ""})` +
        `\nimages: ${imagesOf(pkg).join(", ")}` +
        (missing.length ? `\nMISSING: ${missing.join(", ")}` : "") +
        `\n${brief.sourceText}`
    );
  }
  console.log(`\n${todo.length} videos · one free video or 40 credits each`);
  process.exit(0);
}

const api = createApi(requireSession(false));

if (statusOnly) {
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
      if (run.status === "COMPLETED" && (await downloadFinal(api, entry.runId, new URL(file, OUTPUT)))) {
        entry.file = `output/${file}`;
      }
    } catch (err) {
      console.warn(`${pkg.id} check failed, will retry next time: ${err.message.slice(0, 80)}`);
      continue;
    }
    console.log(`${pkg.id} ${pkg.slug.padEnd(30)} ${entry.status.padEnd(18)} ${entry.file ?? ""}`);
  }
  await saveState(STATE_FILE, state);
  process.exit(0);
}

const ready = todo.filter((pkg) => {
  const missing = missingFootage(pkg);
  if (missing.length) console.warn(`${pkg.id} skipped — missing ${missing.join(", ")} (run demos.mjs --status first)`);
  return !missing.length;
});
await checkBalance(api, ready.length);
const logo = await dataUrl("brand/logo-primary.png", "image/png");
for (const pkg of ready) {
  const brief = briefFor(pkg);
  brief.attachments = await attachmentsFor(pkg, logo);
  const run = await api("/runs", { method: "POST", body: JSON.stringify({ brief }) });
  state[pkg.id] = { runId: run.id, createdAt: new Date().toISOString(), status: run.status };
  await saveState(STATE_FILE, state);
  console.log(`${pkg.id} ${pkg.slug.padEnd(30)} started  https://reelmino.com/runs/${run.id}`);
}
console.log("\nVideos take a few minutes each. Run with --status to check progress and download them.");

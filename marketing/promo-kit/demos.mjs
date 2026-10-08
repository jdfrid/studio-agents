/**
 * Sample videos made WITH Reelmino, used as footage inside the promos.
 * One idea (a neighborhood bakery), produced with different creative settings.
 *
 *   node marketing/promo-kit/demos.mjs --dry-run   # show the settings, no cost
 *   node marketing/promo-kit/demos.mjs             # create the sample videos (one free video each)
 *   node marketing/promo-kit/demos.mjs --status    # download finished ones + extract stills and clips
 *
 * Output: demo/video/<id>.mp4 (full video), demo/<id>-a.png, demo/<id>-b.png (stills), demo/clip-<id>.mp4 (6s).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  BRANDING,
  ROOT,
  checkBalance,
  createApi,
  downloadFinal,
  loadState,
  requireSession,
  saveState
} from "./lib.mjs";

const IDEA =
  "Sunrise Bakery, a small neighborhood bakery. At dawn the baker pulls a tray of golden croissants from the oven, " +
  "arranges them in the window, flips the sign to OPEN and smiles at the first customer. Invite everyone to stop by this week.";

/** Values are the English option labels shown in the Reelmino create form. */
export const DEMOS = [
  {
    id: "pixar",
    label: "Pixar-style 3D",
    creative: {
      designStyle: "Pixar-style",
      realism: "Cartoon 3D",
      colorPalette: "Warm colors",
      characterType: "Business owner",
      wardrobe: "Workwear",
      expression: "Happy",
      location: "Store",
      timeOfDay: "Sunrise",
      lighting: "Cinematic",
      cameraMovement: "Tracking",
      effects: "Bokeh"
    }
  },
  {
    id: "lego",
    label: "LEGO characters",
    creative: {
      designStyle: "LEGO characters",
      characterType: "LEGO character",
      wardrobe: "Workwear",
      location: "Store",
      timeOfDay: "Day",
      colorPalette: "Primary colors",
      cameraMovement: "Zoom in"
    }
  },
  {
    id: "clay",
    label: "Claymation",
    creative: {
      designStyle: "Claymation",
      realism: "Stylized 3D",
      characterType: "Business owner",
      wardrobe: "Workwear",
      location: "Store",
      timeOfDay: "Sunrise",
      colorPalette: "Soft pastel"
    }
  },
  {
    id: "anime",
    label: "Anime",
    creative: {
      designStyle: "Anime",
      realism: "2D illustration",
      characterType: "Business owner",
      wardrobe: "Smart casual",
      location: "Street",
      timeOfDay: "Sunset",
      effects: "Light rays"
    }
  },
  {
    id: "cinematic",
    label: "Cinematic film",
    creative: {
      designStyle: "Cinematic film",
      realism: "Photorealistic",
      colorPalette: "Cinematic teal and orange",
      characterType: "Business owner",
      wardrobe: "Smart casual",
      expression: "Confident",
      location: "Store",
      timeOfDay: "Sunrise",
      lighting: "Cinematic",
      shotType: "Close-up",
      effects: "Slow motion"
    }
  },
  {
    id: "ugc",
    label: "Phone video (UGC)",
    creative: {
      designStyle: "Authentic UGC / phone video",
      realism: "Natural UGC footage",
      characterType: "Influencer / creator",
      wardrobe: "Casual",
      expression: "Enthusiastic",
      location: "Store",
      timeOfDay: "Day"
    }
  },
  {
    id: "formal",
    label: "Wardrobe: Formal",
    creative: {
      designStyle: "Lifestyle",
      realism: "Photorealistic",
      characterType: "Business owner",
      wardrobe: "Formal",
      ageGroup: "Adult",
      location: "Store",
      timeOfDay: "Day",
      lighting: "Bright"
    }
  },
  {
    id: "sporty",
    label: "Wardrobe: Sporty",
    creative: {
      designStyle: "Lifestyle",
      realism: "Photorealistic",
      characterType: "Business owner",
      wardrobe: "Sporty",
      ageGroup: "Young",
      location: "Street",
      timeOfDay: "Sunrise",
      lighting: "Natural"
    }
  }
];

const DEMO_DIR = new URL("demo/", ROOT);
const STATE_FILE = new URL("demo/produced.json", ROOT);
const STILL_AT = { a: 3, b: 9 };
const CLIP = { start: 2, seconds: 6 };

function briefFor(demo) {
  return {
    title: `Reelmino sample — Sunrise Bakery (${demo.label})`,
    sourceText: IDEA,
    targetAudience: "Neighborhood customers",
    language: "en",
    durationSeconds: 24,
    aspectRatio: "9:16",
    budgetMode: true,
    approvalMode: "auto",
    creative: {
      language: "English",
      videoOrientation: "portrait",
      voiceCharacter: "female_warm",
      karaokeCaptions: "on",
      preferHeygenDub: "off",
      ...demo.creative
    },
    branding: { ...BRANDING, businessName: "Sunrise Bakery", slogan: "Fresh every morning.", websiteUrl: "https://reelmino.com" }
  };
}

function ffmpegPath() {
  const store = fileURLToPath(new URL("../../node_modules/.pnpm/", ROOT));
  const dir = existsSync(store) ? readdirSync(store).find((d) => d.startsWith("ffmpeg-static@")) : null;
  return dir ? `${store}${dir}/node_modules/ffmpeg-static/ffmpeg.exe` : "ffmpeg";
}

/** Scene clips are saved before captions are burned in, so stills from them stay clean. */
async function downloadSceneClips(api, entry, id) {
  const artifacts = await api(`/runs/${entry.runId}/artifacts`);
  const list = (Array.isArray(artifacts) ? artifacts : (artifacts.artifacts ?? [])).filter((a) => a.kind === "scene_rendered_clip");
  const byOrder = new Map(list.map((a) => [Number(a.metadata?.order ?? -1), a]));
  for (const order of [0, 1]) {
    const target = new URL(`video/${id}-scene-${order}.mp4`, DEMO_DIR);
    if (existsSync(target) || !byOrder.has(order)) continue;
    const signed = await api(`/artifacts/${byOrder.get(order).id}/signed-url`);
    const buf = Buffer.from(await fetch(signed.url ?? signed.signedUrl).then((r) => r.arrayBuffer()));
    await writeFile(target, buf);
  }
}

function extract(id) {
  const ff = ffmpegPath();
  const src = fileURLToPath(new URL(`video/${id}.mp4`, DEMO_DIR));
  for (const [suffix, order] of [["a", 0], ["b", 1]]) {
    const scene = fileURLToPath(new URL(`video/${id}-scene-${order}.mp4`, DEMO_DIR));
    const [input, at] = existsSync(scene) ? [scene, 3] : [src, STILL_AT[suffix]];
    const out = fileURLToPath(new URL(`${id}-${suffix}.png`, DEMO_DIR));
    execFileSync(ff, ["-y", "-loglevel", "error", "-ss", String(at), "-i", input, "-frames:v", "1", out]);
  }
  const clip = fileURLToPath(new URL(`clip-${id}.mp4`, DEMO_DIR));
  execFileSync(ff, [
    "-y", "-loglevel", "error", "-ss", String(CLIP.start), "-i", src, "-t", String(CLIP.seconds),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", clip
  ]);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const statusOnly = args.includes("--status");
const force = args.includes("--re-extract");
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = onlyArg ? new Set(onlyArg.slice(7).split(",")) : null;

const state = await loadState(STATE_FILE);
const todo = DEMOS.filter((d) => (!only || only.has(d.id)) && !state[d.id]);

if (dryRun) {
  for (const demo of todo) console.log(`${demo.id.padEnd(10)} ${JSON.stringify(demo.creative)}`);
  console.log(`\n${todo.length} sample videos · one free video or 40 credits each`);
  process.exit(0);
}

const api = createApi(requireSession(false));

if (statusOnly) {
  for (const demo of DEMOS) {
    const entry = state[demo.id];
    if (!entry || (only && !only.has(demo.id))) continue;
    try {
      if (!entry.file) {
        const run = await api(`/runs/${entry.runId}`);
        entry.status = run.status;
        if (run.status === "COMPLETED" && (await downloadFinal(api, entry.runId, new URL(`video/${demo.id}.mp4`, DEMO_DIR)))) {
          entry.file = `demo/video/${demo.id}.mp4`;
        }
      }
      if (entry.file && (force || !existsSync(new URL(`clip-${demo.id}.mp4`, DEMO_DIR)))) {
        await downloadSceneClips(api, entry, demo.id);
        extract(demo.id);
      }
    } catch (err) {
      console.warn(`${demo.id} check failed, will retry next time: ${err.message.slice(0, 120)}`);
      continue;
    }
    console.log(`${demo.id.padEnd(10)} ${String(entry.status).padEnd(18)} ${entry.file ?? ""}`);
  }
  await saveState(STATE_FILE, state);
  process.exit(0);
}

await checkBalance(api, todo.length);
for (const demo of todo) {
  const run = await api("/runs", { method: "POST", body: JSON.stringify({ brief: briefFor(demo) }) });
  state[demo.id] = { runId: run.id, createdAt: new Date().toISOString(), status: run.status };
  await saveState(STATE_FILE, state);
  console.log(`${demo.id.padEnd(10)} started  https://reelmino.com/runs/${run.id}`);
}
console.log("\nRun with --status in a few minutes to download the videos and extract stills.");

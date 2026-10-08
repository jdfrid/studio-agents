/** Shared helpers for produce.mjs and demos.mjs (Reelmino API, files, state). */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

export const API = process.env.REELMINO_API ?? "https://reelmino.com/api";
export const ROOT = new URL("./", import.meta.url);
export const CREDITS_PER_VIDEO = 40;

export const BRANDING = {
  businessName: "Reelmino",
  slogan: "Your story. Now in motion.",
  websiteUrl: "https://reelmino.com",
  primaryColor: "#173D35",
  secondaryColor: "#F6F7F2"
};

export function requireSession(dryRun) {
  const session = process.env.REELMINO_SESSION?.trim();
  if (!session && !dryRun) {
    console.error("Set REELMINO_SESSION to your studio_session cookie first.");
    process.exit(1);
  }
  return session;
}

export function createApi(session) {
  const headers = { cookie: `studio_session=${session}`, "content-type": "application/json" };
  return async function api(path, init = {}) {
    const res = await fetch(`${API}${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
    const text = await res.text();
    if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : {};
  };
}

export async function dataUrl(relPath, mimeType) {
  const buf = await readFile(new URL(relPath, ROOT));
  return `data:${mimeType};base64,${buf.toString("base64")}`;
}

export async function loadState(file) {
  if (!existsSync(file)) return {};
  return JSON.parse(await readFile(file, "utf8"));
}

export async function saveState(file, state) {
  await mkdir(new URL("./", file), { recursive: true });
  await writeFile(file, JSON.stringify(state, null, 2));
}

/** Downloads the run's final video to `target` (a file URL). Returns false while not ready. */
export async function downloadFinal(api, runId, target) {
  const artifacts = await api(`/runs/${runId}/artifacts`);
  const list = Array.isArray(artifacts) ? artifacts : (artifacts.artifacts ?? []);
  const final = list.filter((a) => a.kind === "final_video").at(-1);
  if (!final) return false;
  const signed = await api(`/artifacts/${final.id}/signed-url`);
  const buf = Buffer.from(await fetch(signed.url ?? signed.signedUrl).then((r) => r.arrayBuffer()));
  await mkdir(new URL("./", target), { recursive: true });
  await writeFile(target, buf);
  return true;
}

/** Checks free videos / credits before creating `count` runs; exits when short. */
export async function checkBalance(api, count) {
  const me = await api("/auth/me");
  const free = me.freeVideosRemaining ?? 0;
  const needed = Math.max(0, count - free) * CREDITS_PER_VIDEO;
  console.log(`Balance: ${free} free videos + ${me.credits} credits · ${count} videos need ${needed} credits after free videos`);
  if (me.credits < needed) {
    console.error("Not enough credits. Add credits, or use --only= for fewer items.");
    process.exit(1);
  }
}

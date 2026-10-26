import type { ItemCopy } from "./copy.js";

export type AngleKind = "function" | "outcome" | "need";

export type ItemAngles = {
  function: string;
  outcome: string;
  need: string;
};

export type CaptionLock = {
  angleKind: AngleKind;
  frame: number;
  title: string;
  body: string;
};

const ANGLE_CYCLE: AngleKind[] = ["need", "function", "outcome"];

const SHORT_NETWORKS = new Set(["tiktok", "instagram", "x", "threads"]);

const SHORT_SPICES = [
  "",
  "Start there.",
  "That's the whole post.",
  "Keep this one.",
  "Send it to whoever still edits in five apps.",
  "One job. One file.",
  "No extra tools.",
  "Worth a save."
];

const LONG_SPICES = [
  "",
  "Start with that, then post the file.",
  "That's the whole pitch — not a clip generator.",
  "If you still stitch five apps around it, this is the missing step.",
  "One product, that job, then a 30-second video."
];

const SHORT_FRAMES: Record<AngleKind, string[]> = {
  need: [
    "{fact}",
    "{fact} Reelmino is built for that gap.",
    "If this is your week: {fact}",
    "The need nobody budgets for: {fact}",
    "{fact} Stop patching it with five apps.",
    "This is the actual problem: {fact}",
    "Still dealing with this? {fact}",
    "{fact} One product, that job.",
    "The gap: {fact}",
    "Nobody plans for this: {fact}"
  ],
  function: [
    "Reelmino does this: {fact}.",
    "The function that changes the work: {fact}.",
    "{fact} — that's the product, not a clip generator.",
    "One move inside the tool: {fact}.",
    "What it actually does: {fact}.",
    "Use this, not a pile of apps: {fact}.",
    "{fact}. That is the step people skip.",
    "The working part: {fact}.",
    "Inside Reelmino: {fact}.",
    "The actual feature: {fact}."
  ],
  outcome: [
    "The outcome: {fact}.",
    "You leave with {fact}.",
    "{fact}",
    "Done looks like this: {fact}.",
    "The result you can post: {fact}.",
    "{fact} Ready for the feed.",
    "What you get back: {fact}.",
    "Finish line: {fact}.",
    "Post this: {fact}.",
    "Shipped looks like {fact}."
  ]
};

const LONG_FRAMES: Record<AngleKind, string[]> = {
  need: [
    "{fact}\n\nThat is the gap Reelmino is built to close. Not another clip toy — the missing production step.",
    "If this sounds familiar: {fact}\n\nStop stitching five tools around it.",
    "The need: {fact}\n\nOne product, that job, then a file you can post.",
    "{fact}\n\nTeams waste a week on this. The fix is a workflow, not another prompt.",
    "Still dealing with this? {fact}\n\nReelmino takes that need and turns it into a 30-second video.",
    "Nobody budgets for this: {fact}\n\nIt is the real reason videos never ship."
  ],
  function: [
    "Reelmino's actual job here is {fact}.\n\nNot five tools. This one step.",
    "What it does: {fact}.\n\nThat function is why a one-line idea becomes a finished video.",
    "The working part of the product: {fact}.\n\nSkip it and you are back to a pile of apps.",
    "{fact} — that is the function, not a filter.\n\nUse it once per video.",
    "Inside the tool: {fact}.\n\nThat is the move agencies repeat.",
    "One function: {fact}.\n\nThe rest of the run follows from it."
  ],
  outcome: [
    "The outcome: {fact}.\n\nThat is what you post. Not a draft, not a storyboard.",
    "You leave with {fact}.\n\nVoice, music and captions included when the run finishes.",
    "Done looks like this: {fact}.\n\nA file ready for Reels, TikTok and Shorts.",
    "What you get back: {fact}.\n\nOne branded 30-second video, not a folder of clips.",
    "Finish line: {fact}.\n\nIf it is not a finished video, it is not the outcome.",
    "{fact}\n\nThat result is the whole pitch."
  ]
};

export function seedHash(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  return hash >>> 0;
}

export function captionFromHandle(handle: Record<string, unknown> | undefined): CaptionLock | null {
  const raw = handle?.caption;
  if (!raw || typeof raw !== "object") return null;
  const caption = raw as CaptionLock;
  if (!caption.body?.trim()) return null;
  if (caption.angleKind !== "function" && caption.angleKind !== "outcome" && caption.angleKind !== "need") return null;
  return caption;
}

export function calendarAngles(title: string, goal: string, cta: string): ItemAngles {
  const topic = stripEnd(title);
  return {
    function: `produce a video about ${topic}`,
    outcome: `${topic} as a finished 30-second branded video — ${stripEnd(cta)}`,
    need: `teams who need ${topic} still face this: ${stripEnd(goal)}`
  };
}

export function promoAngles(input: { feature: string; message: string; hook: string }): ItemAngles {
  return {
    function: stripEnd(input.feature),
    outcome: stripEnd(input.message),
    need: stripEnd(input.hook)
  };
}

export function factsForItem(item: { title: string; summary: string; copy: ItemCopy }): ItemAngles {
  const stored = item.copy.angles;
  if (stored?.function && stored.outcome && stored.need) return stored;
  const fallback = item.summary || item.copy.instagram?.body || item.copy.tiktok?.body || item.title;
  return {
    function: stripEnd(item.copy.youtube?.title || item.title),
    outcome: stripEnd(fallback),
    need: stripEnd(item.copy.linkedin?.body?.split("\n")[0] || item.title)
  };
}

export function composeFreshCopy(input: {
  item: { title: string; summary: string; copy: ItemCopy };
  network: string;
  seed: string;
  recentBodies?: string[];
  locked?: CaptionLock | null;
}): CaptionLock {
  if (input.locked?.body?.trim()) return input.locked;
  const facts = factsForItem(input.item);
  const short = SHORT_NETWORKS.has(input.network);
  const frames = short ? SHORT_FRAMES : LONG_FRAMES;
  const hash = seedHash(`${input.seed}:${input.network}`);
  const recent = new Set((input.recentBodies ?? []).map((body) => normalizeBody(body)));
  const spices = short ? SHORT_SPICES : LONG_SPICES;
  const startKind = hash % ANGLE_CYCLE.length;
  const startFrame = Math.floor(hash / 3);
  const startSpice = Math.floor(hash / 31);
  const attempts: CaptionLock[] = [];
  const max = ANGLE_CYCLE.length * 10 * spices.length;
  for (let offset = 0; offset < max; offset += 1) {
    const kind = ANGLE_CYCLE[(startKind + offset) % ANGLE_CYCLE.length]!;
    const list = frames[kind];
    const frame = (startFrame + offset) % list.length;
    const spice = spices[(startSpice + offset) % spices.length]!;
    const fact = facts[kind];
    const body = withSpice(fillFrame(list[frame]!, fact, short ? limitFor(input.network) : 1200), spice, short ? limitFor(input.network) : 1200);
    const title = fact.slice(0, 90);
    const candidate: CaptionLock = { angleKind: kind, frame, title, body };
    attempts.push(candidate);
    if (!recent.has(normalizeBody(body))) return candidate;
  }
  return attempts[0]!;
}

function withSpice(body: string, spice: string, maxChars: number): string {
  if (!spice) return body;
  const joined = shortJoin(body, spice);
  if (joined.length <= maxChars) return joined;
  return body;
}

function shortJoin(body: string, spice: string): string {
  return body.includes("\n") ? `${body}\n${spice}` : `${body} ${spice}`;
}

function fillFrame(frame: string, fact: string, maxChars: number): string {
  const filled = frame.replaceAll("{fact}", fact).replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (filled.length <= maxChars) return filled;
  if (fact.length <= maxChars) return fact;
  if (maxChars <= 1) return fact.slice(0, maxChars);
  return `${fact.slice(0, maxChars - 1).trimEnd()}…`;
}

function limitFor(network: string): number {
  if (network === "x" || network === "threads") return 240;
  if (network === "tiktok" || network === "instagram") return 180;
  return 280;
}

function normalizeBody(body: string): string {
  return body.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function stripEnd(value: string): string {
  return value.replace(/\s+/g, " ").trim().replace(/[.?]+$/g, "");
}

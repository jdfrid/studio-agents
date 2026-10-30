import { slugify } from "./catalog.js";
import { languageLock, textMatchesLanguage, titleInLanguage } from "./languageCopy.js";
import { emptyCopy, type ItemCopy } from "./copy.js";
import { nid } from "./crypto.js";
import {
  destinationsForNetwork,
  getDestination,
  getItem,
  getJob,
  getScriptEntry,
  getScriptRun,
  getSetting,
  insertItem,
  insertScriptEntry,
  insertScriptRun,
  listScriptEntries,
  listScriptRuns,
  nextScriptEntry,
  scriptEntryCooling,
  SCRIPT_REUSE_MS,
  openScriptRun,
  scriptRunBySlot,
  setSetting,
  updateItem,
  updateScriptEntry,
  updateScriptRun,
  flag,
  type Destination,
  type GrowthDb,
  type ScriptEntry,
  type ScriptRun
} from "./db.js";
import { downloadReelminoFinal, submitReelminoBrief } from "./produce.js";
import { runPublish } from "./publish.js";
import { tokens } from "./youtubeTrends.js";

export type BankContext = {
  db: GrowthDb;
  key: Buffer;
  mediaDir: string;
  publicBase: string;
};

export const SCRIPT_HOUR_OPTIONS = [1, 2, 4, 6, 8, 12, 24] as const;

const MSG_CHANNEL = "חברו ערוץ יוטיוב פעיל";
const MSG_SESSION = "הגדירו REELMINO_SESSION כדי להפיק סרטון";
const MSG_BUSY = "כבר רץ סרטון מהמאגר. הוא יסתיים לפני שמתחילים עוד אחד.";
const MSG_EMPTY = "כותבים מילות מפתח או תסריט";
const MSG_HOURS = "בחרו מרווח של 1, 2, 4, 6, 8, 12 או 24 שעות";
const MSG_KIND = "בחרו מילות מפתח או תסריט";
const MSG_NONE = "אין במאגר פריט פעיל";
const MSG_WEEK = "הסרטונים שכבר נוצרו זמינים שוב בעוד כשבוע.";

function reuseMessage(lastRunAt: string | null, now: Date): string {
  const at = lastRunAt ? Date.parse(lastRunAt) : Number.NaN;
  if (!Number.isFinite(at)) return MSG_WEEK;
  const again = new Date(at + SCRIPT_REUSE_MS);
  const formatted = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit" }).format(again);
  return `הסרטון כבר נוצר. אפשר להשתמש בו שוב ב-${formatted}.`;
}

export type ScriptBankSettings = {
  enabled: boolean;
  hours: number;
  destinationId: string | null;
};

export type ScriptBankDeps = {
  now?: Date;
  pollAfterMs?: number;
  submitBrief?: (brief: Record<string, unknown>) => Promise<string>;
  downloadFinal?: typeof downloadReelminoFinal;
  publish?: (itemId: string, destination: Destination) => Promise<{ id: string; status: string; remoteUrl?: string | null; lastError?: string | null }>;
};

export function readScriptBankSettings(db: GrowthDb): ScriptBankSettings {
  const hoursRaw = Number(getSetting(db, "script_bank_hours") ?? "4");
  return {
    enabled: flag(db, "script_bank_enabled"),
    hours: (SCRIPT_HOUR_OPTIONS as readonly number[]).includes(hoursRaw) ? hoursRaw : 4,
    destinationId: getSetting(db, "script_bank_destination")?.trim() || null
  };
}

export function applyScriptBankSettings(
  db: GrowthDb,
  patch: Partial<{ enabled: boolean; hours: number; destinationId: string | null }>
): string | null {
  if (patch.hours !== undefined && !(SCRIPT_HOUR_OPTIONS as readonly number[]).includes(patch.hours)) return MSG_HOURS;
  if (patch.destinationId) {
    const row = getDestination(db, patch.destinationId);
    if (!row || row.network !== "youtube" || row.kind !== "channel" || !row.enabled) return "בחרו ערוץ יוטיוב פעיל";
  }
  if (patch.enabled !== undefined) setSetting(db, "script_bank_enabled", patch.enabled ? "1" : "0");
  if (patch.hours !== undefined) setSetting(db, "script_bank_hours", String(patch.hours));
  if (patch.destinationId !== undefined) setSetting(db, "script_bank_destination", patch.destinationId ?? "");
  return null;
}

export function saveScriptEntry(
  db: GrowthDb,
  input: { id?: string; kind: string; title?: string; body: string; language?: string; destinationId?: string | null; feedId?: string | null; enabled?: boolean; createdAt?: string }
): { entry: ScriptEntry | null; error: string | null } {
  const kind = input.kind === "script" ? "script" : input.kind === "keywords" ? "keywords" : null;
  if (!kind) return { entry: null, error: MSG_KIND };
  const body = input.body.trim().slice(0, 4000);
  if (body.length < 2) return { entry: null, error: MSG_EMPTY };
  const language = (input.language ?? "he").trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(language)) return { entry: null, error: "שפה חייבת להיות קוד בן שתי אותיות" };
  const title = (input.title ?? "").replace(/\s+/g, " ").trim().slice(0, 90);
  if (title && title.length < 2) return { entry: null, error: "הכותרת קצרה מדי" };
  const destinationId = input.destinationId?.trim() || null;
  if (destinationId) {
    const row = getDestination(db, destinationId);
    if (!row || row.network !== "youtube" || row.kind !== "channel" || !row.enabled) return { entry: null, error: "בחרו ערוץ יוטיוב פעיל" };
  }
  if (input.id) {
    const updated = updateScriptEntry(db, input.id, {
      kind,
      title,
      body,
      language,
      destinationId,
      ...(typeof input.enabled === "boolean" ? { enabled: input.enabled } : {})
    });
    return updated ? { entry: updated, error: null } : { entry: null, error: "הפריט לא נמצא" };
  }
  return {
    entry: insertScriptEntry(db, { id: nid(), kind, title, body, language, destinationId, feedId: input.feedId ?? null, enabled: input.enabled, createdAt: input.createdAt }),
    error: null
  };
}

export function briefForEntry(input: { kind: "keywords" | "script"; body: string; language: string; title?: string | null }): {
  title: string;
  summary: string;
  description: string;
  brief: Record<string, unknown>;
} {
  const he = input.language.startsWith("he");
  const given = (input.title ?? "").replace(/\s+/g, " ").trim().slice(0, 90);
  const givenOk = Boolean(given) && textMatchesLanguage(given, input.language);
  const firstLine = (input.body.split(/\r?\n/).find((line) => line.trim()) ?? input.body).replace(/\s+/g, " ").trim();
  const spoken = titleInLanguage(input.kind === "script" ? firstLine : input.body, input.language);
  const headline = givenOk ? given : spoken;
  const title = given || headline;
  const ownWords = textMatchesLanguage(input.body, input.language);
  const summary = input.kind === "script"
    ? (he ? "סרטון אנכי לפי התסריט שנשמר במאגר." : "A vertical video that follows the saved script.")
    : ownWords
      ? (he
        ? `סרטון מקורי קצר על ${headline}. מסבירים את הנושא בפשטות ונותנים טיפ אחד שאפשר ליישם מיד.`
        : `An original short about ${headline}. Explain the subject plainly and give one tip people can use immediately.`)
      : (he
        ? "סרטון מקורי קצר. מסבירים את הנושא בפשטות ונותנים טיפ אחד שאפשר ליישם מיד."
        : "An original short. Explain the subject plainly and give one tip people can use immediately.");
  const keepOut = given
    ? (he ? "בתיאור, בקריינות או על המסך" : "the description, the narration, or on screen")
    : (he ? "בכותרת, בתיאור, בקריינות או על המסך" : "the title, the description, the narration, or on screen");
  const subject = ownWords
    ? ""
    : he
      ? `\nהטקסט הבא הוא חומר גלם בלבד. מפיקים ממנו סרטון בעברית, בלי להשאיר את הניסוח המקורי ${keepOut}:\n${input.body.trim()}`
      : `\nThe text below is source material only. Produce the video in English, and do not keep its original wording in ${keepOut}:\n${input.body.trim()}`;
  const instructions = `${input.kind === "script"
    ? (ownWords
      ? (he
        ? "עוקבים אחרי התסריט שסופק: הוא הקריינות והמהלך של הסרטון. בלי להעתיק סרטון, תסריט או קריינות של יוצר אחר. בלי שמות ערוצים ובלי לוגואים של מותג אחר. פתיח ברור בשלוש השניות הראשונות, מסך אנכי."
        : "Follow the supplied script as the narration and the sequence. Do not copy another creator's video, script, or narration. No other channel names and no third-party logos. Clear hook in the first three seconds, vertical frame.")
      : (he
        ? "הטקסט שהוזן הוא חומר גלם בשפה אחרת. כותבים ממנו סרטון חדש בעברית בלבד. בלי להעתיק סרטון של יוצר אחר. בלי שמות ערוצים ובלי לוגואים של מותג אחר. פתיח ברור בשלוש השניות הראשונות, מסך אנכי."
        : "The entered text is source material in another language. Write a new video from it in English only. Do not copy another creator's video. No other channel names and no third-party logos. Clear hook in the first three seconds, vertical frame."))
    : (he
      ? "תוכן מקורי בלבד לפי מילות המפתח. אסור להעתיק סרטון, תסריט, כותרת או קריינות של יוצר אחר. בלי שמות ערוצים ובלי לוגואים של מותג אחר. פתיח ברור בשלוש השניות הראשונות, קריינות קצרה, מסך אנכי."
      : "Original content only, based on the keywords. Do not copy another creator's video, script, title, or narration. No other channel names and no third-party logos. Clear hook in the first three seconds, short narration, vertical frame.")} ${languageLock(input.language)}${given ? (he ? ` כותרת הסרטון ביוטיוב היא בדיוק: ${given}` : ` The YouTube title is exactly: ${given}`) : ""}`;
  const tags = ["#Shorts", ...tokens(headline).slice(0, 3).map((token) => `#${token}`)];
  const description = `${summary.includes(headline) ? summary : `${headline}. ${summary}`}\n\n${tags.join(" ")}`;
  return {
    title,
    summary,
    description,
    brief: {
      title,
      sourceText: (input.kind === "script" && ownWords ? input.body.trim() : summary) + subject,
      instructions,
      targetAudience: he ? "צופים בסרטונים קצרים ביוטיוב" : "YouTube Shorts viewers",
      language: input.language,
      durationSeconds: 30,
      aspectRatio: "9:16",
      budgetMode: true,
      approvalMode: "auto"
    }
  };
}

export function scriptBankView(db: GrowthDb): ScriptBankSettings & { entries: ScriptEntry[]; runs: ScriptRun[] } {
  return { ...readScriptBankSettings(db), entries: listScriptEntries(db), runs: listScriptRuns(db, 20) };
}

export async function advanceScriptBank(ctx: BankContext, deps: ScriptBankDeps = {}): Promise<void> {
  const open = openScriptRun(ctx.db);
  if (open) await executeRun(ctx, open, deps);
  if (!readScriptBankSettings(ctx.db).enabled) return;
  if (openScriptRun(ctx.db)) return;
  const settings = readScriptBankSettings(ctx.db);
  const now = deps.now ?? new Date();
  const slot = bankSlotKey(now, settings.hours);
  if (scriptRunBySlot(ctx.db, slot)) return;
  const entry = nextScriptEntry(ctx.db, now);
  if (!entry) return;
  await produceBankEntry(ctx, entry, slot, deps);
}

export async function runScriptEntry(ctx: BankContext, entryId: string, deps: ScriptBankDeps = {}): Promise<ScriptRun> {
  if (openScriptRun(ctx.db)) throw new Error(MSG_BUSY);
  const entry = getScriptEntry(ctx.db, entryId);
  if (!entry) throw new Error("הפריט לא נמצא");
  const now = deps.now ?? new Date();
  if (scriptEntryCooling(entry.lastRunAt, now)) throw new Error(reuseMessage(entry.lastRunAt, now));
  const run = await produceBankEntry(ctx, entry, `manual-${Date.now()}`, deps);
  if (!run) throw new Error(MSG_BUSY);
  return getScriptRun(ctx.db, run.id) ?? run;
}

export async function runScriptBankNow(ctx: BankContext, deps: ScriptBankDeps = {}): Promise<ScriptRun> {
  if (openScriptRun(ctx.db)) throw new Error(MSG_BUSY);
  const now = deps.now ?? new Date();
  const entry = nextScriptEntry(ctx.db, now);
  if (!entry) {
    const waiting = listScriptEntries(ctx.db).some((row) => row.enabled && !row.feedId && scriptEntryCooling(row.lastRunAt, now));
    throw new Error(waiting ? MSG_WEEK : MSG_NONE);
  }
  return runScriptEntry(ctx, entry.id, deps);
}

export function bankSlotKey(now: Date, hours: number): string {
  const span = hours * 60 * 60 * 1000;
  return `bank-${Math.floor(now.getTime() / span)}`;
}

function bankChannel(db: GrowthDb, entry: ScriptEntry, fallbackId: string | null): Destination | null {
  const chosenId = entry.destinationId || fallbackId;
  if (chosenId) {
    const chosen = getDestination(db, chosenId);
    if (chosen?.network === "youtube" && chosen.kind === "channel" && chosen.enabled) return chosen;
    return null;
  }
  return destinationsForNetwork(db, "youtube").find((row) => row.enabled && row.kind === "channel") ?? null;
}

export async function produceBankEntry(ctx: BankContext, entry: ScriptEntry, slot: string, deps: ScriptBankDeps): Promise<ScriptRun | null> {
  const settings = readScriptBankSettings(ctx.db);
  const content = briefForEntry(entry);
  const destination = bankChannel(ctx.db, entry, settings.destinationId);
  if (!destination) return recordFailure(ctx.db, entry, slot, content.title, MSG_CHANNEL);
  if (!deps.submitBrief && !process.env.REELMINO_SESSION?.trim()) return recordFailure(ctx.db, entry, slot, content.title, MSG_SESSION);
  try {
    const item = insertItem(ctx.db, {
      id: nid(),
      slug: slugify(`bank-${slot}-${entry.id}`),
      source: "script-bank",
      title: content.title,
      summary: content.summary,
      language: entry.language,
      copy: bankCopy(content.title, content.description),
      mediaPath: null,
      mediaMime: null,
      mediaKind: null,
      mediaWidth: null,
      mediaHeight: null,
      mediaDurationMs: null,
      reelminoRunId: null
    });
    const run = insertScriptRun(ctx.db, {
      id: nid(),
      entryId: entry.id,
      slotKey: slot,
      status: "producing",
      title: content.title,
      language: entry.language,
      destinationId: destination.id,
      itemId: item.id
    });
    try {
      const runId = await (deps.submitBrief ?? submitReelminoBrief)(content.brief);
      updateItem(ctx.db, item.id, { reelminoRunId: runId });
      updateScriptEntry(ctx.db, entry.id, { lastRunAt: (deps.now ?? new Date()).toISOString() });
      return updateScriptRun(ctx.db, run.id, { runId, error: null }) ?? run;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return updateScriptRun(ctx.db, run.id, { status: "failed", error: message.slice(0, 500) });
    }
  } catch (error) {
    if (isUnique(error)) return scriptRunBySlot(ctx.db, slot);
    throw error;
  }
}

function recordFailure(db: GrowthDb, entry: ScriptEntry, slot: string, title: string, error: string): ScriptRun | null {
  try {
    return insertScriptRun(db, {
      id: nid(),
      entryId: entry.id,
      slotKey: slot,
      status: "failed",
      title,
      language: entry.language,
      destinationId: entry.destinationId,
      error
    });
  } catch (insertError) {
    if (isUnique(insertError)) return scriptRunBySlot(db, slot);
    throw insertError;
  }
}

async function executeRun(ctx: BankContext, run: ScriptRun, deps: ScriptBankDeps): Promise<void> {
  try {
    const current = getScriptRun(ctx.db, run.id) ?? run;
    if (current.status === "producing") await pullAndPublish(ctx, current, deps);
    else if (current.status === "publishing") await finishPublish(ctx, current, deps);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateScriptRun(ctx.db, run.id, { status: "failed", error: message.slice(0, 500) });
  }
}

async function pullAndPublish(ctx: BankContext, run: ScriptRun, deps: ScriptBankDeps): Promise<void> {
  const pollAfter = deps.pollAfterMs ?? 120_000;
  const updated = Date.parse(run.updatedAt);
  if (Number.isFinite(updated) && Date.now() - updated < pollAfter) return;
  if (!run.runId || !run.itemId) {
    updateScriptRun(ctx.db, run.id, { status: "failed", error: "missing script run" });
    return;
  }
  const file = await (deps.downloadFinal ?? downloadReelminoFinal)(run.runId, ctx.mediaDir);
  if (!file) {
    updateScriptRun(ctx.db, run.id, { status: "producing" });
    return;
  }
  updateItem(ctx.db, run.itemId, {
    mediaPath: file.filename,
    mediaMime: "video/mp4",
    mediaKind: "video",
    mediaWidth: 1080,
    mediaHeight: 1920,
    mediaDurationMs: 30_000
  });
  const publishing = updateScriptRun(ctx.db, run.id, { status: "publishing", error: null });
  if (publishing) await finishPublish(ctx, publishing, deps);
}

async function finishPublish(ctx: BankContext, run: ScriptRun, deps: ScriptBankDeps): Promise<void> {
  if (run.jobId) {
    const job = getJob(ctx.db, run.jobId);
    if (!job) {
      updateScriptRun(ctx.db, run.id, { status: "failed", error: "missing upload job" });
      return;
    }
    if (job.status === "published" || job.status === "draft") {
      updateScriptRun(ctx.db, run.id, { status: "published", remoteUrl: job.remoteUrl, error: null });
      return;
    }
    if (job.status === "failed") {
      updateScriptRun(ctx.db, run.id, { status: "failed", error: (job.lastError || "upload failed").slice(0, 500) });
      return;
    }
    return;
  }
  const destination = run.destinationId ? getDestination(ctx.db, run.destinationId) : null;
  const item = run.itemId ? getItem(ctx.db, run.itemId) : null;
  if (!destination || !item) {
    updateScriptRun(ctx.db, run.id, { status: "failed", error: MSG_CHANNEL });
    return;
  }
  const result = deps.publish
    ? await deps.publish(item.id, destination)
    : await runPublish({
        db: ctx.db,
        key: ctx.key,
        mediaDir: ctx.mediaDir,
        publicBase: ctx.publicBase,
        item,
        destination,
        campaign: getSetting(ctx.db, "utm_campaign") ?? undefined
      });
  if (result.status === "published" || result.status === "draft") {
    updateScriptRun(ctx.db, run.id, { status: "published", jobId: result.id, remoteUrl: result.remoteUrl ?? null, error: null });
    return;
  }
  if (result.status === "failed") {
    updateScriptRun(ctx.db, run.id, { status: "failed", jobId: result.id, error: (result.lastError || "upload failed").slice(0, 500) });
    return;
  }
  updateScriptRun(ctx.db, run.id, { status: "publishing", jobId: result.id, remoteUrl: result.remoteUrl ?? null, error: null });
}

function bankCopy(title: string, description: string): ItemCopy {
  const copy = emptyCopy();
  copy.hashtags = ["Shorts", ...tokens(title).slice(0, 4)];
  copy.youtube = { title: title.slice(0, 90), body: description };
  copy.article = { title, description, body: description };
  return copy;
}

function isUnique(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unique/i.test(message);
}

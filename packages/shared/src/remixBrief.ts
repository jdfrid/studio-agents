import type { ApprovalMode } from "./schemas/auth.js";
import type { BriefInput, BriefOutput } from "./schemas/brief.js";
import type { CreativeOptions } from "./creativeOptions.js";
import { languageCodeFromCreative } from "./creativeOptions.js";

export type RemixKeptAttachment = {
  name: string;
  mimeType: string;
  kind: "image" | "video" | "audio" | "text" | "other";
  role: "anchor" | "scene" | "voice_clone" | "insert_clip" | "reference_video" | "logo" | "product";
  gcsPath: string;
  insertAtSeconds?: number;
  audioSource?: "clip" | "narration";
};

export type RemixFormState = {
  title: string;
  prompt: string;
  instructions: string;
  exclusions: string;
  videoGoal: string;
  desiredAction: string;
  targetAudience: string;
  moods: string[];
  platform: string;
  narrationMode: string;
  musicMode: string;
  durationSeconds: number;
  approvalMode: ApprovalMode;
  creative: CreativeOptions;
  catalogSelections: Record<string, string | number>;
  businessName: string;
  slogan: string;
  websiteUrl: string;
  primaryColor: string;
  secondaryColor: string;
  brandTemplateId: string;
  keptAttachments: RemixKeptAttachment[];
};

const GOAL_LABELS: Record<string, string[]> = {
  product: ["Promote a product", "פרסום מוצר"],
  service: ["Promote a service", "פרסום שירות"],
  brand: ["Build a business brand", "תדמית עסקית"],
  social: ["Social media", "רשתות חברתיות"],
  explainer: ["Explain or teach", "הסבר או הדרכה"],
  event: ["Event invitation", "הזמנה לאירוע"],
  other: ["Other", "אחר"]
};

const ACTION_LABELS: Record<string, string[]> = {
  buy: ["Buy", "לקנות"],
  visit_site: ["Visit the website", "להיכנס לאתר"],
  submit_details: ["Submit details", "להשאיר פרטים"],
  contact: ["Get in touch", "ליצור קשר"],
  learn: ["Learn and understand", "ללמוד ולהבין"],
  remember_brand: ["Remember the brand", "לזכור את המותג"],
  none: ["No specific action", "ללא פעולה מוגדרת"]
};

const MOOD_LABELS: Record<string, string[]> = {
  professional: ["Professional & trustworthy", "מקצועי ואמין"],
  luxury: ["Premium", "יוקרתי"],
  emotional: ["Emotional", "מרגש"],
  energetic: ["Young & energetic", "צעיר ואנרגטי"],
  modern: ["Clean & modern", "נקי ומודרני"],
  dramatic: ["Dramatic", "דרמטי"],
  calm: ["Calm", "רגוע"],
  other: ["Other", "אחר"]
};

const PLATFORM_LABELS: Record<string, string[]> = {
  instagram_reels: ["Instagram Reels"],
  tiktok: ["TikTok"],
  youtube_shorts: ["YouTube Shorts"],
  linkedin: ["LinkedIn"],
  youtube: ["YouTube landscape", "YouTube לרוחב"],
  website: ["Website / presentation", "אתר / מצגת"]
};

const GOAL_PREFIXES = ["Video goal: ", "מטרת הסרטון: "];
const ACTION_PREFIXES = ["Desired viewer action: ", "הפעולה הרצויה מהצופה: "];
const MOOD_PREFIXES = ["Required mood: ", "אווירה נדרשת: "];
const PLATFORM_PREFIXES = ["Target platform: ", "פלטפורמת יעד: "];
const EXCLUSION_PREFIXES = ["Do not show in the video: ", "מה אסור להציג בסרטון: "];
const NO_NARRATION = [
  "No narration or speech; use music and on-screen text only.",
  "ללא קריינות או דיבור; להשתמש במוזיקה ובטקסט על המסך בלבד."
];
const DIALOGUE = [
  "Prefer natural dialogue between characters instead of external narration.",
  "להעדיף שיחה טבעית בין הדמויות במקום קריינות חיצונית."
];
const NO_MUSIC = ["No background music.", "ללא מוזיקת רקע."];

function lookupCode(table: Record<string, string[]>, value: string): string {
  const needle = value.trim();
  for (const [code, labels] of Object.entries(table)) {
    if (labels.some((label) => label === needle)) return code;
  }
  return "";
}

function takePrefixed(lines: string[], prefixes: string[]): { value: string | null; rest: string[] } {
  const index = lines.findIndex((line) => prefixes.some((prefix) => line.startsWith(prefix)));
  if (index < 0) return { value: null, rest: lines };
  const line = lines[index]!;
  const prefix = prefixes.find((item) => line.startsWith(item))!;
  return {
    value: line.slice(prefix.length).trim(),
    rest: lines.filter((_, i) => i !== index)
  };
}

function isListed(line: string, options: string[]): boolean {
  return options.includes(line.trim());
}

export function remixAttachmentsFromBrief(
  brief: BriefInput,
  briefOutput?: Pick<BriefOutput, "visualAnchors" | "voiceCloneSample" | "videoInsert" | "branding"> | null
): RemixKeptAttachment[] {
  const unusedAnchors = [...(briefOutput?.visualAnchors ?? [])];
  const kept: RemixKeptAttachment[] = [];
  const attachments = brief.attachments ?? [];

  for (const att of attachments) {
    let gcsPath = att.gcsPath?.trim() || "";
    if (!gcsPath) {
      if (att.role === "logo") gcsPath = briefOutput?.branding?.logo?.gcsPath ?? "";
      else if (att.role === "voice_clone") gcsPath = briefOutput?.voiceCloneSample?.gcsPath ?? "";
      else if (att.role === "insert_clip") gcsPath = briefOutput?.videoInsert?.gcsPath ?? "";
      else if (att.role === "anchor" || att.role === "scene" || att.role === "product") {
        const matchIndex = unusedAnchors.findIndex(
          (anchor) => anchor.name === att.name || (att.role !== "scene" && anchor.role === att.role)
        );
        if (matchIndex >= 0) {
          gcsPath = unusedAnchors[matchIndex]!.gcsPath;
          unusedAnchors.splice(matchIndex, 1);
        }
      }
    }
    if (!gcsPath) continue;
    kept.push({
      name: att.name,
      mimeType: att.mimeType,
      kind: att.kind,
      role: att.role,
      gcsPath,
      ...(att.insertAtSeconds != null ? { insertAtSeconds: att.insertAtSeconds } : {}),
      ...(att.audioSource ? { audioSource: att.audioSource } : {})
    });
  }

  if (kept.length) return kept;

  for (const anchor of unusedAnchors) {
    kept.push({
      name: anchor.name,
      mimeType: anchor.mimeType,
      kind: "image",
      role: anchor.role === "product" ? "product" : "anchor",
      gcsPath: anchor.gcsPath
    });
  }
  if (briefOutput?.voiceCloneSample?.gcsPath) {
    kept.push({
      name: briefOutput.voiceCloneSample.name,
      mimeType: briefOutput.voiceCloneSample.mimeType,
      kind: "audio",
      role: "voice_clone",
      gcsPath: briefOutput.voiceCloneSample.gcsPath
    });
  }
  if (briefOutput?.videoInsert?.gcsPath) {
    kept.push({
      name: briefOutput.videoInsert.name,
      mimeType: briefOutput.videoInsert.mimeType,
      kind: "video",
      role: "insert_clip",
      gcsPath: briefOutput.videoInsert.gcsPath,
      insertAtSeconds: briefOutput.videoInsert.insertAtSeconds,
      audioSource: briefOutput.videoInsert.audioSource
    });
  }
  if (briefOutput?.branding?.logo?.gcsPath) {
    kept.push({
      name: briefOutput.branding.logo.name,
      mimeType: briefOutput.branding.logo.mimeType,
      kind: "image",
      role: "logo",
      gcsPath: briefOutput.branding.logo.gcsPath
    });
  }
  return kept;
}

export function remixFormFromBrief(
  brief: BriefInput,
  briefOutput?: Pick<BriefOutput, "visualAnchors" | "voiceCloneSample" | "videoInsert" | "branding"> | null
): RemixFormState {
  const sourceLines = brief.sourceText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const goalTaken = takePrefixed(sourceLines, GOAL_PREFIXES);
  const actionTaken = takePrefixed(goalTaken.rest, ACTION_PREFIXES);
  const moodTaken = takePrefixed(actionTaken.rest, MOOD_PREFIXES);
  const platformTaken = takePrefixed(moodTaken.rest, PLATFORM_PREFIXES);

  const videoGoal = lookupCode(GOAL_LABELS, goalTaken.value ?? "") || "other";
  const desiredAction = lookupCode(ACTION_LABELS, actionTaken.value ?? "");
  const moods = (moodTaken.value ?? "")
    .split(",")
    .map((item) => lookupCode(MOOD_LABELS, item.trim()))
    .filter(Boolean)
    .slice(0, 2);
  let platform = lookupCode(PLATFORM_LABELS, platformTaken.value ?? "") || "instagram_reels";
  if (brief.creative?.videoOrientation === "landscape" && (platform === "instagram_reels" || !platformTaken.value)) {
    platform = "youtube";
  }
  const prompt = platformTaken.rest.join("\n").trim() || brief.sourceText.trim();

  const instructionLines = (brief.instructions ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let narrationMode = "voiceover";
  let musicMode = "auto";
  let exclusions = "";
  const leftover: string[] = [];
  for (const line of instructionLines) {
    if (isListed(line, NO_NARRATION)) {
      narrationMode = "none";
      continue;
    }
    if (isListed(line, DIALOGUE)) {
      narrationMode = "dialogue";
      continue;
    }
    if (isListed(line, NO_MUSIC)) {
      musicMode = "none";
      continue;
    }
    const exclusion = takePrefixed([line], EXCLUSION_PREFIXES);
    if (exclusion.value) {
      exclusions = exclusion.value;
      continue;
    }
    leftover.push(line);
  }
  if (brief.creative?.preferHeygenDub === "on") narrationMode = "lip_sync";
  if (brief.creative?.musicTempo === "איטי" || brief.creative?.musicTempo === "slow") musicMode = "calm";
  if (brief.creative?.musicTempo === "מהיר" || brief.creative?.musicTempo === "fast") musicMode = "energetic";

  const catalogSelections: Record<string, string | number> = {};
  for (const item of brief.creativeCatalogSnapshot ?? []) {
    catalogSelections[item.fieldKey] = item.value;
  }

  const creative: CreativeOptions = {
    karaokeCaptions: "on",
    preferHeygenDub: "off",
    language: languageCodeFromCreative(brief.creative) ?? brief.language ?? "en",
    ...(brief.creative ?? {})
  };
  if (narrationMode === "lip_sync") creative.preferHeygenDub = "on";

  return {
    title: brief.title,
    prompt,
    instructions: leftover.join("\n"),
    exclusions,
    videoGoal,
    desiredAction,
    targetAudience: brief.targetAudience ?? "",
    moods,
    platform,
    narrationMode,
    musicMode,
    durationSeconds: brief.durationSeconds,
    approvalMode: (brief.approvalMode ?? "auto_until_render") as ApprovalMode,
    creative,
    catalogSelections,
    businessName: brief.branding?.businessName ?? "",
    slogan: brief.branding?.slogan ?? "",
    websiteUrl: brief.branding?.websiteUrl ?? "",
    primaryColor: brief.branding?.primaryColor ?? "",
    secondaryColor: brief.branding?.secondaryColor ?? "",
    brandTemplateId: brief.brandTemplateId ?? "",
    keptAttachments: remixAttachmentsFromBrief(brief, briefOutput)
  };
}

export function remixHasAdvancedCreative(creative: CreativeOptions): boolean {
  const basic = new Set(["videoOrientation", "language", "targetAudience", "filmTemplate", "karaokeCaptions", "preferHeygenDub"]);
  return Object.entries(creative).some(([key, value]) => value != null && value !== "" && !basic.has(key));
}

import type { SceneSpec, ScriptOutput } from "./schemas/script.js";

/** Core system rule: every scene must share cast, wardrobe, and location. */
export const CONTINUITY_LOCK =
  "CRITICAL: Use the EXACT same fictional characters (same gender, age, face, hair, skin tone, wardrobe) and the EXACT same location in every scene. Only action, pose, and camera may change.";

export type ContinuityContext = {
  characterBible: string;
  backgroundVisualPrompt: string;
  order: number;
  total: number;
};

export function deriveCharacterBible(backgroundVisualPrompt: string, explicit?: string | null): string {
  const fromLlm = explicit?.trim();
  if (fromLlm && fromLlm.length >= 16) return fromLlm.slice(0, 800);
  const bg = backgroundVisualPrompt.trim();
  if (bg.length >= 16) {
    return `Fixed cast and setting (never change between shots): ${bg}`.slice(0, 800);
  }
  return "Fixed cast: one consistent fictional protagonist; same wardrobe and location throughout.";
}

const PROMPT_MAX = 1600;

function clampPrompt(text: string, max = PROMPT_MAX): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function buildReferenceImagePrompt(
  ctx: ContinuityContext & { sceneAction: string }
): string {
  const action = stripContinuityPrefix(ctx.sceneAction).trim();
  // Reserve room for lock + action; trim bible/location so Zod max(1600) never fails.
  const fixed = [
    CONTINUITY_LOCK,
    `Scene ${ctx.order + 1} of ${ctx.total}.`,
    "Same people, same clothes, same place — only pose and micro-action change."
  ].join(" ");
  const budget = PROMPT_MAX - fixed.length - 48;
  const half = Math.max(80, Math.floor(budget / 3));
  const characters = ctx.characterBible.trim().slice(0, half);
  const location = ctx.backgroundVisualPrompt.trim().slice(0, half);
  const actionBudget = Math.max(80, budget - characters.length - location.length);
  const actionClamped = action.slice(0, actionBudget);
  return clampPrompt(
    [
      CONTINUITY_LOCK,
      `Scene ${ctx.order + 1} of ${ctx.total}.`,
      `Characters (locked): ${characters}.`,
      `Location (locked): ${location}.`,
      `Action for this frame only: ${actionClamped}.`,
      "Same people, same clothes, same place — only pose and micro-action change."
    ].join(" ")
  );
}

export function buildVeoContinuityPrefix(ctx: ContinuityContext): string {
  return [
    CONTINUITY_LOCK,
    `Scene ${ctx.order + 1} of ${ctx.total}.`,
    `Character lock: ${ctx.characterBible.trim()}.`,
    `Location lock: ${ctx.backgroundVisualPrompt.trim()}.`
  ].join(" ");
}

function stripContinuityPrefix(text: string): string {
  if (!text.includes(CONTINUITY_LOCK)) return text;
  const idx = text.lastIndexOf("Action for this frame only:");
  if (idx >= 0) return text.slice(idx + "Action for this frame only:".length).trim();
  return text.replace(CONTINUITY_LOCK, "").trim();
}

function prefixScenePrompt(existing: string, ctx: ContinuityContext): string {
  const core = stripContinuityPrefix(existing).trim();
  const prefix = `Same cast & location. ${ctx.characterBible.trim()}. `;
  const combined = `${prefix}${core}`;
  return combined.length <= 1200 ? combined : combined.slice(0, 1200);
}

/** Post-process script output so every scene carries locked cast/location tokens. */
export function applyContinuityToScript(
  output: ScriptOutput,
  explicitCharacterBible?: string | null
): ScriptOutput {
  const characterBible = deriveCharacterBible(output.backgroundVisualPrompt, explicitCharacterBible ?? output.characterBible);
  const total = output.scenes.length;

  const scenes: SceneSpec[] = output.scenes.map((scene, index) => {
    const ctx: ContinuityContext = {
      characterBible,
      backgroundVisualPrompt: output.backgroundVisualPrompt,
      order: index,
      total
    };
    const actionSource = scene.referenceImagePrompt ?? scene.visualPrompt ?? scene.veoPrompt;
    return {
      ...scene,
      visualPrompt: clampPrompt(prefixScenePrompt(scene.visualPrompt, ctx)),
      veoPrompt: clampPrompt(prefixScenePrompt(scene.veoPrompt, ctx)),
      referenceImagePrompt: buildReferenceImagePrompt({ ...ctx, sceneAction: actionSource }),
      firstFramePrompt: scene.firstFramePrompt
        ? buildReferenceImagePrompt({ ...ctx, sceneAction: scene.firstFramePrompt })
        : scene.firstFramePrompt,
      lastFramePrompt: scene.lastFramePrompt
        ? buildReferenceImagePrompt({ ...ctx, sceneAction: scene.lastFramePrompt })
        : scene.lastFramePrompt
    };
  });

  return { ...output, characterBible, scenes };
}

export type ReferenceImageBytes = { data: Buffer; mimeType: string };

export const REFERENCE_IMAGE_INSTRUCTION =
  "Use the attached reference image(s) for wardrobe, setting, and overall look continuity. Keep the same fictional characters and environment; change pose/action as described. Do not copy real celebrity likenesses or brand logos.";

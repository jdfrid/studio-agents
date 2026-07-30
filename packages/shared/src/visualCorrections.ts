import { z } from "zod";
import { applyContinuityToScript } from "./continuity.js";
import type { ScriptOutput } from "./schemas/script.js";

export const VisualCorrectionsRequestSchema = z.object({
  characterBible: z.string().max(800).optional(),
  corrections: z.string().max(500).optional(),
  sceneOverrides: z
    .array(
      z.object({
        sceneId: z.string(),
        visualNotes: z.string().max(600)
      })
    )
    .optional(),
  rerunFrom: z.enum(["asset", "render"]).nullable().optional()
});
export type VisualCorrectionsRequest = z.infer<typeof VisualCorrectionsRequestSchema>;

export type VisualCorrectionsInput = Omit<VisualCorrectionsRequest, "rerunFrom">;

export function mergeCharacterBible(base: string, corrections?: string, explicit?: string): string {
  let bible = (explicit?.trim() || base.trim()).slice(0, 800);
  const notes = corrections?.trim();
  if (notes) {
    const suffix = `. תיקונים ויזואליים (חובה בכל סצנה): ${notes}`;
    bible = `${bible}${suffix}`.slice(0, 800);
  }
  return bible;
}

/** Apply directed visual fixes to script output and re-lock continuity on all scenes. */
export function applyVisualCorrections(script: ScriptOutput, input: VisualCorrectionsInput): ScriptOutput {
  const characterBible = mergeCharacterBible(script.characterBible, input.corrections, input.characterBible);
  const correctionsNote = input.corrections?.trim() || script.visualCorrections;

  let scenes = script.scenes;
  if (input.sceneOverrides?.length) {
    const byId = new Map(input.sceneOverrides.filter((o) => o.visualNotes.trim()).map((o) => [o.sceneId, o.visualNotes.trim()]));
    scenes = scenes.map((scene) => {
      const notes = byId.get(scene.id);
      if (!notes) return scene;
      return {
        ...scene,
        visualPrompt: notes,
        veoPrompt: notes.slice(0, 1600)
      };
    });
  }

  const patched: ScriptOutput = {
    ...script,
    characterBible,
    visualCorrections: correctionsNote,
    scenes
  };

  return applyContinuityToScript(patched, characterBible);
}

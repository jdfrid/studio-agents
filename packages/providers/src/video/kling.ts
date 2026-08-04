import type { ProviderCredentialView, RenderProfile } from "@studio/shared";
import { createFalI2vBeatGenerator } from "./falI2v.js";
import type { VideoBeatGenerator } from "./types.js";

/** Kling 2.1 via fal.ai — thin wrapper around shared fal I2V client. */
export function createKlingBeatGenerator(profile: RenderProfile, credential: ProviderCredentialView): VideoBeatGenerator {
  return createFalI2vBeatGenerator(profile, credential);
}


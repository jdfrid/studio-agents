import type { ProviderCredentialView, RenderProfile } from "@studio/shared";
import { ProviderError, usesFalVideoProvider, usesHeygenVideoProvider } from "@studio/shared";
import { createFalI2vBeatGenerator } from "./falI2v.js";
import { createHeygenBeatGenerator } from "./heygen.js";
import { createKlingBeatGenerator } from "./kling.js";
import type { VideoBeatGenerator } from "./types.js";
import { createVeoBeatGenerator } from "./veo.js";

export * from "./types.js";
export { createVeoBeatGenerator, resolveExtendHandle } from "./veo.js";
export { createKlingBeatGenerator } from "./kling.js";
export { createFalI2vBeatGenerator } from "./falI2v.js";
export { createHeygenBeatGenerator } from "./heygen.js";

export function getVideoBeatGenerator(profile: RenderProfile, credential: ProviderCredentialView): VideoBeatGenerator {
  if (usesFalVideoProvider(profile)) {
    return profile.provider === "kling"
      ? createKlingBeatGenerator(profile, credential)
      : createFalI2vBeatGenerator(profile, credential);
  }
  if (usesHeygenVideoProvider(profile)) {
    return createHeygenBeatGenerator(profile, credential);
  }
  if (profile.provider === "veo") {
    return createVeoBeatGenerator(profile, credential);
  }
  throw new ProviderError(`Unsupported render profile provider: ${profile.provider}`, {
    provider: profile.provider,
    metadata: { profileId: profile.id }
  });
}


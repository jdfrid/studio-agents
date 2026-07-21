import type { ProviderCredentialView, RenderProfile } from "@studio/shared";
import { ProviderError } from "@studio/shared";
import { createKlingBeatGenerator } from "./kling.js";
import type { VideoBeatGenerator } from "./types.js";
import { createVeoBeatGenerator } from "./veo.js";

export * from "./types.js";
export { createVeoBeatGenerator, resolveExtendHandle } from "./veo.js";
export { createKlingBeatGenerator } from "./kling.js";

export function getVideoBeatGenerator(profile: RenderProfile, credential: ProviderCredentialView): VideoBeatGenerator {
  if (profile.provider === "kling") {
    return createKlingBeatGenerator(profile, credential);
  }
  if (profile.provider === "veo") {
    return createVeoBeatGenerator(profile, credential);
  }
  throw new ProviderError(`Unsupported render profile provider: ${profile.provider}`, {
    provider: profile.provider,
    metadata: { profileId: profile.id }
  });
}

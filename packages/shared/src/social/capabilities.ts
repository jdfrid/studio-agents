import type { SocialAuthKind, SocialNetwork } from "./enums.js";
import type { CapabilityManifest } from "./schemas.js";

const commonFeatures = {
  scheduleNative: false,
  cover: false,
  firstComment: false,
  privacy: false,
  location: false,
  altText: false,
  playlist: false,
  notifyFollowers: false
} as const;

export const NETWORK_CAPABILITIES: Record<SocialNetwork, CapabilityManifest> = {
  telegram: {
    media: ["video", "image", "text"],
    limits: {
      maxBytes: 50 * 1024 * 1024,
      captionChars: 1024,
      titleChars: 0,
      imageCount: 10
    },
    features: { ...commonFeatures, notifyFollowers: true },
    publishProtocol: "sync"
  },
  youtube: {
    media: ["video"],
    limits: {
      maxDurationMs: 12 * 60 * 60 * 1000,
      maxBytes: 256 * 1024 * 1024,
      captionChars: 5000,
      titleChars: 100
    },
    features: {
      ...commonFeatures,
      scheduleNative: true,
      cover: true,
      privacy: true,
      playlist: true
    },
    publishProtocol: "resumable"
  },
  facebook: {
    media: ["video", "image", "text"],
    limits: {
      maxDurationMs: 4 * 60 * 60 * 1000,
      maxBytes: 256 * 1024 * 1024,
      captionChars: 63206,
      titleChars: 255
    },
    features: {
      ...commonFeatures,
      scheduleNative: true,
      cover: true,
      privacy: true
    },
    publishProtocol: "sync"
  },
  instagram: {
    media: ["video", "image", "carousel"],
    limits: {
      maxDurationMs: 15 * 60 * 1000,
      maxBytes: 256 * 1024 * 1024,
      captionChars: 2200,
      titleChars: 0,
      aspects: ["9:16", "1:1", "4:5"],
      imageCount: 10
    },
    features: { ...commonFeatures, cover: true, altText: true },
    publishProtocol: "container_then_publish",
    strictAspect: true
  },
  x: {
    media: ["video", "image", "text"],
    limits: {
      maxDurationMs: 140_000,
      maxBytes: 512 * 1024 * 1024,
      captionChars: 280,
      titleChars: 0,
      imageCount: 4
    },
    features: { ...commonFeatures, altText: true },
    publishProtocol: "resumable"
  },
  tiktok: {
    media: ["video", "image"],
    limits: {
      maxDurationMs: 10 * 60 * 1000,
      maxBytes: 256 * 1024 * 1024,
      captionChars: 2200,
      titleChars: 150,
      aspects: ["9:16"]
    },
    features: {
      ...commonFeatures,
      privacy: true,
      cover: true
    },
    publishProtocol: "inbox_draft",
    strictAspect: true
  }
};

export interface NetworkAuthSpec {
  kind: SocialAuthKind;
  envKeys: string[];
  pkce: boolean;
}

export const NETWORK_AUTH: Record<SocialNetwork, NetworkAuthSpec> = {
  telegram: { kind: "bot_token", envKeys: [], pkce: false },
  youtube: {
    kind: "oauth2",
    envKeys: ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    pkce: false
  },
  facebook: { kind: "oauth2", envKeys: ["META_APP_ID", "META_APP_SECRET"], pkce: false },
  instagram: { kind: "oauth2", envKeys: ["META_APP_ID", "META_APP_SECRET"], pkce: false },
  x: { kind: "oauth2", envKeys: ["X_CLIENT_ID", "X_CLIENT_SECRET"], pkce: true },
  tiktok: { kind: "oauth2", envKeys: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"], pkce: true }
};

export function networkAuthConfigured(network: SocialNetwork): { configured: boolean; missingEnv: string[] } {
  const spec = NETWORK_AUTH[network];
  if (spec.kind === "bot_token") return { configured: true, missingEnv: [] };
  if (network === "youtube") {
    const hasDedicated = Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET);
    const hasGoogle = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    return hasDedicated || hasGoogle
      ? { configured: true, missingEnv: [] }
      : { configured: false, missingEnv: ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"] };
  }
  const missing = spec.envKeys.filter((key) => !process.env[key]);
  return { configured: missing.length === 0, missingEnv: missing };
}

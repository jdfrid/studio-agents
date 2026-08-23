import type { RenderProfile } from "@studio/shared";

export type VideoBeatRequest = {
  sceneId: string;
  prompt: string;
  aspectRatio: "9:16" | "16:9";
  durationBucket: "4" | "6" | "8";
  durationSeconds: number;
  referenceImage?: { body: Buffer; mimeType: string } | null;
  firstFrame?: { body: Buffer; mimeType: string } | null;
  lastFrame?: { body: Buffer; mimeType: string } | null;
  extendVideoHandle?: string | null;
  generateAudio?: boolean;
  /** Scene narration text (HeyGen script fallback when no voice audio). */
  narrationText?: string | null;
  /** Pre-rendered TTS for lip-sync providers (HeyGen audio_asset_id). */
  voiceAudio?: { body: Buffer; mimeType: string } | null;
};

export type VideoBeatResult = {
  provider: string;
  model: string;
  operationName: string;
  status: "completed" | "failed";
  videoBytes?: Buffer;
  mimeType?: string;
  extendHandle?: string;
  error?: string;
};

export type VideoBeatHooks = {
  onPoll?: (event: {
    operationName: string;
    model: string;
    status: string;
    error?: string | null;
  }) => Promise<void> | void;
  onUsage?: (event: {
    activityType: string;
    sceneId?: string;
    model: string;
    durationMs?: number | null;
    billedUnits?: number;
    unit?: string;
    charged?: "yes" | "no" | "unknown";
    metadata?: Record<string, unknown>;
  }) => Promise<void> | void;
  onRateLimitWait?: (info: {
    attempt: number;
    maxAttempts: number;
    delayMs: number;
    phase: string;
  }) => Promise<void> | void;
};

export interface VideoBeatGenerator {
  readonly profile: RenderProfile;
  generateBeat(req: VideoBeatRequest, hooks?: VideoBeatHooks): Promise<VideoBeatResult>;
}

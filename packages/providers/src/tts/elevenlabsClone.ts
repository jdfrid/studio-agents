import { fetch as undiciFetch } from "undici";
import { ProviderError } from "@studio/shared";

export async function elevenLabsCloneVoice(opts: {
  apiKey: string;
  name: string;
  filename: string;
  mimeType: string;
  body: Buffer;
  removeBackgroundNoise?: boolean;
}): Promise<{ voiceId: string }> {
  const form = new FormData();
  form.append("name", opts.name);
  form.append(
    "files",
    new Blob([new Uint8Array(opts.body)], { type: opts.mimeType || "audio/mpeg" }),
    opts.filename || "sample.mp3"
  );
  if (opts.removeBackgroundNoise) {
    form.append("remove_background_noise", "true");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await undiciFetch("https://api.elevenlabs.io/v1/voices/add", {
      method: "POST",
      headers: { "xi-api-key": opts.apiKey },
      // DOM FormData is accepted by undici at runtime; typings disagree across versions.
      body: form as unknown as import("undici").RequestInit["body"],
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) {
      throw new ProviderError(`ElevenLabs voice clone failed: ${text.slice(0, 400)}`, {
        provider: "elevenlabs",
        metadata: { status: response.status }
      });
    }
    const json = text ? (JSON.parse(text) as { voice_id?: string }) : {};
    const voiceId = json.voice_id?.trim();
    if (!voiceId) {
      throw new ProviderError("ElevenLabs voice clone returned no voice_id", { provider: "elevenlabs" });
    }
    return { voiceId };
  } finally {
    clearTimeout(timeout);
  }
}

export async function elevenLabsDeleteVoice(apiKey: string, voiceId: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await undiciFetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`, {
      method: "DELETE",
      headers: { "xi-api-key": apiKey },
      signal: controller.signal
    });
    if (!response.ok && response.status !== 404) {
      const text = await response.text();
      throw new ProviderError(`ElevenLabs delete voice failed: ${text.slice(0, 400)}`, {
        provider: "elevenlabs",
        metadata: { status: response.status }
      });
    }
  } finally {
    clearTimeout(timeout);
  }
}

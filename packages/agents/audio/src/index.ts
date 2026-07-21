import { fetchMusic, geminiGenerateMusic, geminiSynthesizeSpeech, synthesizeSpeech } from "@studio/providers";
import {
  AudioInputSchema,
  AudioOutputSchema,
  type Agent,
  type AudioInput,
  type AudioOutput
} from "@studio/shared";

export const audioAgent: Agent<AudioInput, AudioOutput> = {
  name: "audio",
  inputSchema: AudioInputSchema,
  outputSchema: AudioOutputSchema,
  async run(ctx, input) {
    await ctx.log.log("audio_start", "Audio Agent started", { sceneCount: input.scenes.length });

    const gemini = await ctx.providers.primary("GEMINI");
    const tts = gemini ?? (await ctx.providers.primary("TTS"));
    const music = gemini ?? (await ctx.providers.primary("MUSIC"));

    const perScene: AudioOutput["perScene"] = [];
    let lastVoiceError: string | null = null;
    for (const scene of input.scenes) {
      if (!tts || scene.audioPolicy === "veo_native_audio" || scene.audioPolicy === "muted") {
        perScene.push({
          sceneId: scene.sceneId,
          voiceArtifactId: null,
          voiceGcsPath: null,
          voiceDurationSeconds: null,
          provider: null,
          model: null,
          voiceError: null
        });
        continue;
      }
      try {
        const audio =
          tts.type === "GEMINI"
            ? await geminiSynthesizeSpeech(tts, { text: scene.narration, language: input.language }, async (event) => {
                await ctx.cost.record({ ...event, sceneId: scene.sceneId });
              })
            : await synthesizeSpeech(tts, { text: scene.narration, language: input.language });
        const voiceExt = audio.mimeType.includes("wav") ? "wav" : audio.mimeType.includes("mpeg") ? "mp3" : "audio";
        const artifact = await ctx.artifacts.save({
          runId: ctx.runId,
          stage: "audio",
          kind: "voice_clip",
          body: audio.body,
          mimeType: audio.mimeType,
          filename: `voice-${scene.sceneId}.${voiceExt}`,
          metadata: { sceneId: scene.sceneId, provider: audio.provider, model: "model" in audio && typeof audio.model === "string" ? audio.model : undefined }
        });
        perScene.push({
          sceneId: scene.sceneId,
          voiceArtifactId: artifact.id,
          voiceGcsPath: artifact.gcsPath,
          voiceDurationSeconds: audio.durationSeconds,
          provider: audio.provider,
          model: "model" in audio && typeof audio.model === "string" ? audio.model : null,
          voiceError: null
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        lastVoiceError = message;
        await ctx.log.log("audio_voice_failed", "TTS failed for scene", {
          sceneId: scene.sceneId,
          error: message
        });
        perScene.push({
          sceneId: scene.sceneId,
          voiceArtifactId: null,
          voiceGcsPath: null,
          voiceDurationSeconds: null,
          provider: null,
          model: null,
          voiceError: message
        });
      }
    }

    const scenesNeedingVoice = input.scenes.filter(
      (scene) => scene.audioPolicy !== "veo_native_audio" && scene.audioPolicy !== "muted"
    );
    const voicedCount = perScene.filter((row) => row.voiceArtifactId).length;
    if (scenesNeedingVoice.length > 0 && voicedCount === 0) {
      throw new Error(`TTS failed for all scenes${lastVoiceError ? `: ${lastVoiceError}` : ""}`);
    }

    let musicOut: AudioOutput["music"] = {
      artifactId: null,
      gcsPath: null,
      durationSeconds: null,
      prompt: input.musicPrompt,
      provider: null,
      model: null,
      requiresExternalMusic: false,
      unavailableReason: null
    };

    if (music && input.musicPrompt) {
      try {
        const track =
          music.type === "GEMINI"
            ? await geminiGenerateMusic(
                music,
                { prompt: input.musicPrompt, durationSeconds: input.scenes.reduce((sum, s) => sum + s.durationSeconds, 0) },
                async (event) => {
                  await ctx.cost.record(event);
                }
              )
            : await fetchMusic(music, { prompt: input.musicPrompt });
        const artifact = await ctx.artifacts.save({
          runId: ctx.runId,
          stage: "audio",
          kind: "music_track",
          body: track.body,
          mimeType: track.mimeType,
          filename: `music.${track.mimeType.includes("wav") ? "wav" : track.mimeType.includes("mpeg") ? "mp3" : "audio"}`,
          metadata: {
            provider: track.provider,
            sourceUrl: "sourceUrl" in track ? track.sourceUrl : undefined,
            model: "model" in track ? track.model : undefined
          }
        });
        musicOut = {
          artifactId: artifact.id,
          gcsPath: artifact.gcsPath,
          durationSeconds: "durationSeconds" in track ? track.durationSeconds : null,
          prompt: input.musicPrompt,
          provider: track.provider,
          model: "model" in track ? track.model : null,
          requiresExternalMusic: false,
          unavailableReason: null
        };
      } catch (error) {
        await ctx.log.log("audio_music_failed", "Music fetch failed", { error: (error as Error).message });
        musicOut = {
          ...musicOut,
          requiresExternalMusic: true,
          unavailableReason: (error as Error).message
        };
      }
    } else if (input.musicPrompt) {
      musicOut = {
        ...musicOut,
        requiresExternalMusic: true,
        unavailableReason: "No GEMINI/MUSIC provider configured"
      };
    }

    await ctx.log.log("audio_done", "Audio Agent finished", {
      voiced: perScene.filter((s) => s.voiceArtifactId).length,
      hasMusic: !!musicOut.artifactId
    });
    return { perScene, music: musicOut };
  }
};

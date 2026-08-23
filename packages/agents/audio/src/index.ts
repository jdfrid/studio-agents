import {
  elevenLabsCloneVoice,
  elevenLabsDeleteVoice,
  fetchMusic,
  geminiGenerateMusic,
  geminiSynthesizeSpeech,
  synthesizeSpeech
} from "@studio/providers";
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
    const ttsProvider = await ctx.providers.primary("TTS");
    const music = gemini ?? (await ctx.providers.primary("MUSIC"));

    const sample = input.voiceCloneSample ?? null;
    let clonedVoiceId: string | null = null;
    let elevenApiKey: string | null = null;
    let useClonedVoice = false;

    if (sample?.gcsPath) {
      const eleven =
        ttsProvider && ttsProvider.provider.toLowerCase().includes("eleven") ? ttsProvider : null;
      if (!eleven?.secret) {
        throw new Error("שיבוט קול לא מוגדר בשרת");
      }
      elevenApiKey = eleven.secret;
      const downloaded = await ctx.storage.download(sample.gcsPath);
      const clone = await elevenLabsCloneVoice({
        apiKey: elevenApiKey,
        name: `run-${ctx.runId}`.slice(0, 80),
        filename: sample.name || "voice-sample.mp3",
        mimeType: sample.mimeType || downloaded.mimeType || "audio/mpeg",
        body: downloaded.body
      });
      clonedVoiceId = clone.voiceId;
      useClonedVoice = true;
      await ctx.log.log("audio_voice_cloned", "ElevenLabs instant voice clone ready", {
        voiceId: clonedVoiceId
      });
    }

    const defaultTts = gemini ?? ttsProvider;

    try {
      const perScene: AudioOutput["perScene"] = [];
      let lastVoiceError: string | null = null;
      for (const scene of input.scenes) {
        if (
          (!useClonedVoice && !defaultTts) ||
          scene.audioPolicy === "veo_native_audio" ||
          scene.audioPolicy === "muted" ||
          !String(scene.narration ?? "").trim()
        ) {
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
            useClonedVoice && elevenApiKey && clonedVoiceId
              ? await synthesizeSpeech(
                  {
                    id: "env-elevenlabs",
                    type: "TTS",
                    provider: "elevenlabs",
                    priority: 0,
                    config: { model: "eleven_multilingual_v2" },
                    secret: elevenApiKey
                  },
                  { text: scene.narration, language: input.language, voice: clonedVoiceId }
                )
              : defaultTts!.type === "GEMINI"
                ? await geminiSynthesizeSpeech(
                    defaultTts!,
                    {
                      text: scene.narration,
                      language: input.language,
                      ...(input.voiceName ? { voiceName: input.voiceName } : {}),
                      ...(input.voiceStyle ? { style: input.voiceStyle } : {})
                    },
                    async (event) => {
                      await ctx.cost.record({ ...event, sceneId: scene.sceneId });
                    }
                  )
                : await synthesizeSpeech(defaultTts!, {
                    text: scene.narration,
                    language: input.language
                  });
          const voiceExt = audio.mimeType.includes("wav")
            ? "wav"
            : audio.mimeType.includes("mpeg")
              ? "mp3"
              : "audio";
          const artifact = await ctx.artifacts.save({
            runId: ctx.runId,
            stage: "audio",
            kind: "voice_clip",
            body: audio.body,
            mimeType: audio.mimeType,
            filename: `voice-${scene.sceneId}.${voiceExt}`,
            metadata: {
              sceneId: scene.sceneId,
              provider: audio.provider,
              model: "model" in audio && typeof audio.model === "string" ? audio.model : undefined,
              clonedVoice: useClonedVoice
            }
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
                  {
                    prompt: input.musicPrompt,
                    durationSeconds: input.scenes.reduce((sum, s) => sum + s.durationSeconds, 0)
                  },
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
        hasMusic: !!musicOut.artifactId,
        clonedVoice: useClonedVoice
      });
      return { perScene, music: musicOut };
    } finally {
      if (clonedVoiceId && elevenApiKey) {
        try {
          await elevenLabsDeleteVoice(elevenApiKey, clonedVoiceId);
          await ctx.log.log("audio_voice_clone_deleted", "Deleted temporary ElevenLabs voice", {
            voiceId: clonedVoiceId
          });
        } catch (error) {
          await ctx.log.log("audio_voice_clone_delete_failed", "Failed to delete cloned voice", {
            voiceId: clonedVoiceId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }
  }
};

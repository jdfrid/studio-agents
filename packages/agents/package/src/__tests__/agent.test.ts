import { describe, expect, it } from "vitest";
import { packageAgent } from "../index.js";
import type { AgentContext } from "@studio/shared";

function makeStubCtx(): AgentContext {
  const saved: any[] = [];
  return {
    runId: "run1",
    tenantId: "t1",
    stage: "package",
    stageExecutionId: "se-package",
    attempt: 1,
    cost: { record: async () => undefined },
    artifacts: {
      list: async () => [],
      save: async (input) => {
        const record = {
          id: `art-${saved.length}`,
          runId: input.runId,
          stage: input.stage,
          kind: input.kind,
          gcsPath: `runs/${input.runId}/${input.stage}/${input.filename}`,
          mimeType: input.mimeType,
          sizeBytes: typeof input.body === "string" ? input.body.length : (input.body as Buffer).byteLength,
          metadata: input.metadata ?? {},
          createdAt: new Date().toISOString()
        };
        saved.push(record);
        return record;
      },
      signedUrl: async (id) => `https://signed.example/${id}`
    },
    providers: {
      listEnabled: async () => [],
      primary: async () => null
    },
    storage: {
      bucket: () => "test",
      upload: async (input) => ({ gcsPath: input.gcsPath, sizeBytes: 0 }),
      download: async () => ({ body: Buffer.from(""), mimeType: "application/octet-stream" }),
      signedUrl: async (p) => `https://signed.example/${p}`
    },
    log: makeNoopLogger()
  };
}

function makeNoopLogger(): { log: () => void; child: () => any } {
  const noop = { log: () => undefined, child: () => noop };
  return noop;
}

describe("packageAgent", () => {
  it("builds timeline from script + audio + asset", async () => {
    const ctx = makeStubCtx();
    const out = await packageAgent.run(ctx, {
      brief: {
        title: "Demo",
        summary: "s",
        targetAudience: "a",
        toneOfVoice: "t",
        style: "st",
        durationSeconds: 10,
        aspectRatio: "9:16",
        language: "he",
        brandConstraints: [],
        visualDirection: "v",
        musicDirection: "m",
        references: []
      },
      script: {
        scenes: [
          {
            id: "s1",
            order: 0,
            title: "Scene 1",
            narration: "Hi",
            visualPrompt: "vp",
            veoPrompt: "veo vp",
            referenceImagePrompt: "reference vp",
            durationBucket: "4",
            audioPolicy: "gemini_tts_plus_music",
            durationSeconds: 5,
            requiredAssets: ["voice", "music", "video"]
          },
          {
            id: "s2",
            order: 1,
            title: "Scene 2",
            narration: "Bye",
            visualPrompt: "vp2",
            veoPrompt: "veo vp2",
            referenceImagePrompt: "reference vp2",
            durationBucket: "6",
            audioPolicy: "gemini_tts_plus_music",
            durationSeconds: 5,
            requiredAssets: ["voice", "music", "video"]
          }
        ],
        totalDurationSeconds: 10,
        musicPrompt: "music",
        backgroundVisualPrompt: "bg"
      },
      audio: {
        perScene: [
          { sceneId: "s1", voiceArtifactId: "v1", voiceGcsPath: "runs/run1/audio/v1.mp3", voiceDurationSeconds: 4 },
          { sceneId: "s2", voiceArtifactId: null, voiceGcsPath: null, voiceDurationSeconds: null }
        ],
        music: {
          artifactId: "m1",
          gcsPath: "runs/run1/audio/m.mp3",
          durationSeconds: null,
          prompt: "music",
          requiresExternalMusic: false
        }
      },
      asset: {
        perScene: [
          {
            sceneId: "s1",
            kind: "video",
            sourceProvider: "pexels",
            sourceUrl: "u1",
            artifactId: "a1",
            gcsPath: "runs/run1/asset/a1.mp4",
            mimeType: "video/mp4",
            width: 1080,
            height: 1920
          },
          {
            sceneId: "s2",
            kind: "image",
            sourceProvider: "pexels",
            sourceUrl: "u2",
            artifactId: "a2",
            gcsPath: "runs/run1/asset/a2.jpg",
            mimeType: "image/jpeg",
            width: 1080,
            height: 1920
          }
        ]
      }
    });
    expect(out.timeline).toHaveLength(2);
    expect(out.timeline[0]!.startSecond).toBe(0);
    expect(out.timeline[0]!.endSecond).toBe(5);
    expect(out.timeline[1]!.startSecond).toBe(5);
    expect(out.timeline[1]!.endSecond).toBe(10);
    expect(out.geminiRenderPlanArtifactId).toBeTruthy();
    expect(out.manifestSignedUrl).toMatch(/^https:\/\/signed\.example/);
  });
});

import {
  NoProviderConfiguredError,
  AssetInputSchema,
  AssetOutputSchema,
  assetGenerationMode,
  isBudgetMode,
  type Agent,
  type AgentContext,
  type AssetInput,
  type AssetOutput
} from "@studio/shared";
import type { ProviderCredentialView } from "@studio/shared";
import { geminiGenerateImage, searchMedia } from "@studio/providers";

export const assetAgent: Agent<AssetInput, AssetOutput> = {
  name: "asset",
  inputSchema: AssetInputSchema,
  outputSchema: AssetOutputSchema,
  async run(ctx, input) {
    await ctx.log.log("asset_start", "Asset Agent started", { sceneCount: input.scenes.length });
    const gemini = await ctx.providers.primary("GEMINI");
    const mediaProvider = await ctx.providers.primary("MEDIA_SEARCH");

    const perScene: AssetOutput["perScene"] = [];
    const assetMode = assetGenerationMode(isBudgetMode({ budgetMode: input.budgetMode }));
    let sharedReference: AssetOutput["perScene"][number]["referenceFrame"] | null = null;

    for (const scene of input.scenes) {
      if (scene.uploadedAssetGcsPath) {
        // Trust the upload from the brief stage; create an artifact record pointing at it.
        const artifact = await ctx.artifacts.save({
          runId: ctx.runId,
          stage: "asset",
          kind: scene.preferredKind === "image" ? "scene_image_source" : "scene_video_source",
          body: Buffer.from(""),
          mimeType: scene.preferredKind === "image" ? "image/jpeg" : "video/mp4",
          filename: `scene-${scene.sceneId}-ref.bin`,
          metadata: { sceneId: scene.sceneId, viaUpload: true, originalGcsPath: scene.uploadedAssetGcsPath }
        });
        perScene.push({
          sceneId: scene.sceneId,
          kind: scene.preferredKind,
          sourceProvider: "user-upload",
          sourceUrl: null,
          artifactId: artifact.id,
          gcsPath: scene.uploadedAssetGcsPath,
          mimeType: scene.preferredKind === "image" ? "image/jpeg" : "video/mp4",
          width: null,
          height: null
        });
        continue;
      }
      if (gemini) {
        const referencePrompt = scene.referenceImagePrompt ?? scene.visualPrompt;
        let referenceArtifactId: string;
        let referenceGcsPath: string;
        let referenceMimeType: string;
        let referenceModel: string;
        let referenceSignedUrl: string;

        if (assetMode === "shared_reference" && sharedReference) {
          referenceArtifactId = sharedReference.artifactId;
          referenceGcsPath = sharedReference.gcsPath;
          referenceSignedUrl = sharedReference.signedUrl ?? (await ctx.storage.signedUrl(referenceGcsPath));
          referenceMimeType = "image/png";
          referenceModel = sharedReference.model;
        } else {
          const reference = await geminiGenerateImage(gemini, { prompt: referencePrompt, aspectRatio: input.aspectRatio });
          const referenceArtifact = await ctx.artifacts.save({
            runId: ctx.runId,
            stage: "asset",
            kind: "scene_reference_frame",
            body: reference.body,
            mimeType: reference.mimeType,
            filename: `scene-${scene.sceneId}-reference.png`,
            metadata: { sceneId: scene.sceneId, prompt: referencePrompt, provider: reference.provider, model: reference.model }
          });
          referenceArtifactId = referenceArtifact.id;
          referenceGcsPath = referenceArtifact.gcsPath;
          referenceMimeType = reference.mimeType;
          referenceModel = reference.model;
          referenceSignedUrl = await ctx.storage.signedUrl(referenceArtifact.gcsPath);
          if (assetMode === "shared_reference") {
            sharedReference = {
              artifactId: referenceArtifactId,
              gcsPath: referenceGcsPath,
              signedUrl: referenceSignedUrl,
              prompt: referencePrompt,
              model: referenceModel
            };
          }
        }

        const firstFrame =
          assetMode === "full" && scene.firstFramePrompt
            ? await saveGeneratedFrame(ctx, gemini, scene.sceneId, "scene_first_frame", "first", scene.firstFramePrompt, input.aspectRatio)
            : null;
        const lastFrame =
          assetMode === "full" && scene.lastFramePrompt
            ? await saveGeneratedFrame(ctx, gemini, scene.sceneId, "scene_last_frame", "last", scene.lastFramePrompt, input.aspectRatio)
            : null;

        perScene.push({
          sceneId: scene.sceneId,
          kind: "image",
          sourceProvider: "gemini",
          sourceUrl: null,
          artifactId: referenceArtifactId,
          gcsPath: referenceGcsPath,
          mimeType: referenceMimeType,
          width: null,
          height: null,
          model: referenceModel,
          referenceFrame: {
            artifactId: referenceArtifactId,
            gcsPath: referenceGcsPath,
            signedUrl: referenceSignedUrl,
            prompt: referencePrompt,
            model: referenceModel
          },
          firstFrame,
          lastFrame
        });
        continue;
      }

      if (!mediaProvider) throw new NoProviderConfiguredError("GEMINI");
      const result = await searchMedia(mediaProvider, {
        prompt: scene.visualPrompt,
        preferredKind: scene.preferredKind,
        aspectRatio: input.aspectRatio
      });
      const artifact = await ctx.artifacts.save({
        runId: ctx.runId,
        stage: "asset",
        kind: result.kind === "image" ? "scene_image_source" : "scene_video_source",
        body: result.body,
        mimeType: result.mimeType,
        filename: `scene-${scene.sceneId}.${result.kind === "image" ? "jpg" : "mp4"}`,
        metadata: { sceneId: scene.sceneId, provider: result.provider, sourceUrl: result.sourceUrl, width: result.width, height: result.height }
      });
      perScene.push({
        sceneId: scene.sceneId,
        kind: result.kind,
        sourceProvider: result.provider,
        sourceUrl: result.sourceUrl,
        artifactId: artifact.id,
        gcsPath: artifact.gcsPath,
        mimeType: result.mimeType,
        width: result.width,
        height: result.height
      });
    }
    await ctx.log.log("asset_done", "Asset Agent finished", { collected: perScene.length });
    return { perScene };
  }
};

async function saveGeneratedFrame(
  ctx: AgentContext,
  gemini: ProviderCredentialView,
  sceneId: string,
  kind: "scene_first_frame" | "scene_last_frame",
  label: string,
  prompt: string,
  aspectRatio: string
) {
  const frame = await geminiGenerateImage(gemini, { prompt, aspectRatio });
  const artifact = await ctx.artifacts.save({
    runId: ctx.runId,
    stage: "asset",
    kind,
    body: frame.body,
    mimeType: frame.mimeType,
    filename: `scene-${sceneId}-${label}.png`,
    metadata: { sceneId, prompt, provider: frame.provider, model: frame.model }
  });
  return {
    artifactId: artifact.id,
    gcsPath: artifact.gcsPath,
    signedUrl: await ctx.storage.signedUrl(artifact.gcsPath),
    prompt,
    model: frame.model
  };
}

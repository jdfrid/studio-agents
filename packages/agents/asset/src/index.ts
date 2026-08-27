import {

  NoProviderConfiguredError,

  AssetInputSchema,

  AssetOutputSchema,

  assetGenerationMode,

  buildReferenceImagePrompt,

  deriveCharacterBible,

  isBudgetMode,

  type Agent,

  type AgentContext,

  type ArtifactRecord,

  type AssetInput,

  type AssetOutput,

  type ReferenceImageBytes

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

    const characterBible = deriveCharacterBible(input.backgroundVisualPrompt ?? "", input.characterBible);

    const backgroundVisualPrompt = input.backgroundVisualPrompt ?? "";

    const assetMode = assetGenerationMode(isBudgetMode({ budgetMode: input.budgetMode }));

    let chainReference: ReferenceImageBytes | null = null;

    let anchorReference: ReferenceImageBytes | null = null;

    const MAX_INLINE_ANCHORS = 4;

    const resolvedAnchorPaths = Array.from(
      new Set(
        [
          ...(input.visualAnchorGcsPaths ?? []),
          ...(input.visualAnchorGcsPath ? [input.visualAnchorGcsPath] : [])
        ].filter(Boolean)
      )
    );

    const anchorReferences: ReferenceImageBytes[] = [];

    for (const gcsPath of resolvedAnchorPaths.slice(0, MAX_INLINE_ANCHORS)) {

      const anchor = await ctx.storage.download(gcsPath);

      const ref: ReferenceImageBytes = { data: anchor.body, mimeType: anchor.mimeType };

      anchorReferences.push(ref);

      if (!anchorReference) {
        anchorReference = ref;
      }

    }

    // A single uploaded person can be used directly as the locked cast plate.
    // With multiple people, leave the chain empty so scene 1 generates one
    // composite plate from every uploaded face; later scenes reuse that plate.
    if (anchorReferences.length === 1) {
      chainReference = anchorReferences[0]!;
    }

    const productPaths = Array.from(new Set((input.visualProductGcsPaths ?? []).filter(Boolean)));
    const productReferences: ReferenceImageBytes[] = [];
    for (const gcsPath of productPaths.slice(0, MAX_INLINE_ANCHORS)) {
      const product = await ctx.storage.download(gcsPath);
      productReferences.push({ data: product.body, mimeType: product.mimeType });
    }
    if (productReferences.length) {
      await ctx.log.log("asset_product_plates", "Using locked product B-roll plates", {
        count: productReferences.length,
        gcsPaths: productPaths
      });
    }

    if (resolvedAnchorPaths.length) {

      await ctx.log.log("asset_visual_anchor", "Using brief visual anchors for continuity", {

        count: resolvedAnchorPaths.length,

        usedInline: anchorReferences.length,

        gcsPaths: resolvedAnchorPaths

      });

    }

    const existingReferences = await loadExistingReferenceFrames(ctx);



    for (const [sceneIndex, scene] of input.scenes.entries()) {

      // Locked product / B-roll plate — use the upload pixels directly as the I2V still.
      if (!scene.uploadedAssetGcsPath && productReferences.length) {
        const plate = productReferences[sceneIndex % productReferences.length]!;
        const plateMime = plate.mimeType.startsWith("image/") ? plate.mimeType : "image/png";
        const referenceArtifact = await ctx.artifacts.save({
          runId: ctx.runId,
          stage: "asset",
          kind: "scene_reference_frame",
          body: plate.data,
          mimeType: plateMime,
          filename: `scene-${scene.sceneId}-product-plate.png`,
          metadata: {
            sceneId: scene.sceneId,
            viaProductPlate: true,
            prompt: "locked product B-roll plate"
          }
        });
        const referenceSignedUrl = await ctx.storage.signedUrl(referenceArtifact.gcsPath);
        const frameRef: ReferenceImageBytes = { data: plate.data, mimeType: plateMime };
        if (!anchorReference) anchorReference = frameRef;
        chainReference = frameRef;
        perScene.push({
          sceneId: scene.sceneId,
          kind: scene.preferredKind === "video" ? "video" : "image",
          sourceProvider: "user-product-plate",
          sourceUrl: null,
          artifactId: referenceArtifact.id,
          gcsPath: referenceArtifact.gcsPath,
          mimeType: plateMime,
          width: null,
          height: null,
          referenceFrame: {
            artifactId: referenceArtifact.id,
            gcsPath: referenceArtifact.gcsPath,
            signedUrl: referenceSignedUrl,
            prompt: "locked product B-roll plate",
            model: "user-product-plate"
          }
        });
        continue;
      }

      if (scene.uploadedAssetGcsPath) {

        const uploaded = await ctx.storage.download(scene.uploadedAssetGcsPath);

        const uploadedMime = uploaded.mimeType.startsWith("video/") ? uploaded.mimeType : "image/png";

        const referenceArtifact = await ctx.artifacts.save({

          runId: ctx.runId,

          stage: "asset",

          kind: "scene_reference_frame",

          body: uploaded.body,

          mimeType: uploadedMime,

          filename: `scene-${scene.sceneId}-uploaded-reference.png`,

          metadata: { sceneId: scene.sceneId, viaUpload: true, originalGcsPath: scene.uploadedAssetGcsPath }

        });

        const referenceSignedUrl = await ctx.storage.signedUrl(referenceArtifact.gcsPath);

        const frameRef: ReferenceImageBytes = { data: uploaded.body, mimeType: uploadedMime };

        if (!anchorReference) anchorReference = frameRef;

        chainReference = frameRef;

        perScene.push({

          sceneId: scene.sceneId,

          kind: scene.preferredKind === "video" ? "video" : "image",

          sourceProvider: "user-upload",

          sourceUrl: null,

          artifactId: referenceArtifact.id,

          gcsPath: referenceArtifact.gcsPath,

          mimeType: uploadedMime,

          width: null,

          height: null,

          referenceFrame: {

            artifactId: referenceArtifact.id,

            gcsPath: referenceArtifact.gcsPath,

            signedUrl: referenceSignedUrl,

            prompt: "user upload",

            model: "manual"

          }

        });

        continue;

      }

      if (gemini) {

        const referencePrompt = buildReferenceImagePrompt({

          characterBible,

          backgroundVisualPrompt,

          sceneAction: scene.referenceImagePrompt ?? scene.visualPrompt,

          order: sceneIndex,

          total: input.scenes.length,

          hasUserCharacterPhotos: anchorReferences.length > 0

        });

        let referenceArtifactId: string;

        let referenceGcsPath: string;

        let referenceMimeType: string;

        let referenceModel: string;

        let referenceSignedUrl: string;

        let referenceBody: Buffer;



        const existing = existingReferences.get(scene.sceneId);

        if (existing) {

          await ctx.log.log("asset_reuse_reference", "Reusing existing reference frame from prior attempt", {

            sceneId: scene.sceneId,

            artifactId: existing.id

          });

          referenceArtifactId = existing.id;

          referenceGcsPath = existing.gcsPath;

          referenceMimeType = existing.mimeType;

          referenceModel = String(existing.metadata.model ?? "gemini");

          referenceSignedUrl = await ctx.storage.signedUrl(existing.gcsPath);

          referenceBody = (await ctx.storage.download(existing.gcsPath)).body;

        } else {

          const continuityRefs: ReferenceImageBytes[] = [];

          // Prefer user character photos: speaker a→photo1, b→photo2; always pass both when available.
          if (anchorReferences.length) {
            const speakerIdx =
              scene.speaker === "b" ? 1 : scene.speaker === "a" ? 0 : sceneIndex % anchorReferences.length;
            const primary =
              anchorReferences[Math.min(speakerIdx, anchorReferences.length - 1)] ?? anchorReferences[0]!;
            continuityRefs.push(primary);
            if (anchorReferences.length > 1) {
              const other = anchorReferences.find((r) => r !== primary) ?? anchorReferences[1]!;
              if (other !== primary) continuityRefs.push(other);
            }
          } else if (assetMode === "shared_reference" && anchorReference) {
            continuityRefs.push(anchorReference);
          } else if (chainReference) {
            continuityRefs.push(chainReference);
          }

          // With uploaded cast photos: generate ONE locked plate (wardrobe+faces) and reuse it for every beat.
          // Per-scene Gemini regen was inventing new coat colors and breaking continuity.
          if (anchorReferences.length && chainReference) {
            referenceBody = chainReference.data;
            referenceMimeType = chainReference.mimeType;
            referenceModel = "shared-cast-plate";
            const referenceArtifact = await ctx.artifacts.save({
              runId: ctx.runId,
              stage: "asset",
              kind: "scene_reference_frame",
              body: referenceBody,
              mimeType: referenceMimeType,
              filename: `scene-${scene.sceneId}-reference.png`,
              metadata: {
                sceneId: scene.sceneId,
                prompt: referencePrompt,
                provider: "shared-cast-plate",
                model: referenceModel,
                continuityChained: true,
                reusedSharedPlate: true
              }
            });
            referenceArtifactId = referenceArtifact.id;
            referenceGcsPath = referenceArtifact.gcsPath;
            referenceSignedUrl = await ctx.storage.signedUrl(referenceArtifact.gcsPath);
            await ctx.log.log("asset_shared_cast_plate", "Reusing locked cast plate for wardrobe continuity", {
              sceneId: scene.sceneId
            });
          } else {
          const anchorHint = continuityRefs.length
            ? " The attached photo(s) ARE the cast: preserve their exact faces, identities, AND wardrobe (same coat/jacket colors). Place them at the event. Prefer a conversational framing. Do not invent different people or recolor clothing. Keep outfits identical for the whole film."
            : "";

          let plateProvider = "gemini";

          try {
            const reference = await geminiGenerateImage(
              gemini,
              { prompt: `${referencePrompt}${anchorHint}`, aspectRatio: input.aspectRatio, referenceImages: continuityRefs },
              async (event) => {
                await ctx.cost.record({ ...event, sceneId: scene.sceneId });
              }
            );
            referenceBody = reference.body;
            referenceMimeType = reference.mimeType;
            referenceModel = reference.model;
            plateProvider = reference.provider;
          } catch (err) {
            // Never invent faces: fall back to the speaker's uploaded photo as the I2V plate.
            if (!continuityRefs.length) throw err;
            const fallback = continuityRefs[0]!;
            await ctx.log.log("asset_anchor_plate_fallback", "Gemini image failed; using uploaded character photo as reference plate", {
              sceneId: scene.sceneId,
              error: err instanceof Error ? err.message : String(err)
            });
            referenceBody = fallback.data;
            referenceMimeType = fallback.mimeType;
            referenceModel = "user-upload-plate";
            plateProvider = "user-upload";
          }

          const referenceArtifact = await ctx.artifacts.save({

            runId: ctx.runId,

            stage: "asset",

            kind: "scene_reference_frame",

            body: referenceBody,

            mimeType: referenceMimeType,

            filename: `scene-${scene.sceneId}-reference.png`,

            metadata: {

              sceneId: scene.sceneId,

              prompt: referencePrompt,

              provider: plateProvider,

              model: referenceModel,

              continuityChained: continuityRefs.length > 0,

              sharedCastPlate: anchorReferences.length > 0

            }

          });

          referenceArtifactId = referenceArtifact.id;

          referenceGcsPath = referenceArtifact.gcsPath;

          referenceSignedUrl = await ctx.storage.signedUrl(referenceArtifact.gcsPath);

          }

        }

        const frameRef: ReferenceImageBytes = { data: referenceBody, mimeType: referenceMimeType };

        if (!anchorReference) anchorReference = frameRef;

        chainReference = frameRef;



        const firstFrame =

          assetMode === "full" && scene.firstFramePrompt

            ? await saveGeneratedFrame(

                ctx,

                gemini,

                scene.sceneId,

                "scene_first_frame",

                "first",

                scene.firstFramePrompt,

                input.aspectRatio,

                frameRef

              )

            : null;

        const lastFrame =

          assetMode === "full" && scene.lastFramePrompt

            ? await saveGeneratedFrame(

                ctx,

                gemini,

                scene.sceneId,

                "scene_last_frame",

                "last",

                scene.lastFramePrompt,

                input.aspectRatio,

                frameRef

              )

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

    return {
      perScene,
      visualAnchorGcsPath: input.visualAnchorGcsPath ?? resolvedAnchorPaths[0],
      visualAnchorGcsPaths: resolvedAnchorPaths
    };

  }

};



async function loadExistingReferenceFrames(ctx: AgentContext): Promise<Map<string, ArtifactRecord>> {

  const rows = await ctx.artifacts.list(ctx.runId, "asset");

  const map = new Map<string, ArtifactRecord>();

  for (const row of rows) {

    if (row.kind !== "scene_reference_frame") continue;

    const sceneId = row.metadata.sceneId;

    if (typeof sceneId !== "string" || !sceneId) continue;

    map.set(sceneId, row);

  }

  return map;

}



async function saveGeneratedFrame(

  ctx: AgentContext,

  gemini: ProviderCredentialView,

  sceneId: string,

  kind: "scene_first_frame" | "scene_last_frame",

  label: string,

  prompt: string,

  aspectRatio: string,

  continuityRef?: ReferenceImageBytes | null

) {

  const frame = await geminiGenerateImage(

    gemini,

    {

      prompt,

      aspectRatio,

      referenceImages: continuityRef ? [continuityRef] : undefined

    },

    async (event) => {

    await ctx.cost.record({ ...event, sceneId });

  });

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



import { geminiCompleteJson, llmCompleteJson } from "@studio/providers";
import {
  BriefInputSchema,
  BriefOutputSchema,
  NoProviderConfiguredError,
  aspectRatioFromCreative,
  contentLanguageEnglishName,
  contentLanguageNativeName,
  creativeFlagOn,
  formatCreativeConstraints,
  geminiVoiceNameFromCreative,
  defaultGeminiVoiceForLanguage,
  languageCodeFromCreative,
  normalizeContentLanguage,
  resolveContentLanguage,
  resolveRenderProfile,
  userFacingLanguageInstruction,
  type Agent,
  type BriefInput,
  type BriefOutput
} from "@studio/shared";

type ReferenceVideoAnalysis = NonNullable<BriefOutput["referenceVideoAnalysis"]>;

export const briefAgent: Agent<BriefInput, BriefOutput> = {
  name: "brief",
  inputSchema: BriefInputSchema,
  outputSchema: BriefOutputSchema,
  async run(ctx, input) {
    await ctx.log.log("brief_start", "Brief Agent started", { title: input.title });
    await ctx.artifacts.save({
      runId: ctx.runId,
      stage: "brief",
      kind: "brief_input",
      body: JSON.stringify(input, null, 2),
      mimeType: "application/json",
      filename: "brief-input.json"
    });

    const provider = (await ctx.providers.primary("GEMINI")) ?? (await ctx.providers.primary("LLM"));
    if (!provider) throw new NoProviderConfiguredError("GEMINI");

    const contentLang = resolveContentLanguage({
      language: languageCodeFromCreative(input.creative) ?? input.language,
      creativeLanguage: input.creative?.language,
      creativeAccent: input.creative?.accent,
      title: input.title,
      sourceText: input.sourceText,
      instructions: input.instructions
    });
    const langEn = contentLanguageEnglishName(contentLang);
    const langNative = contentLanguageNativeName(contentLang);

    const system = [
      "You are a senior creative producer. Convert free-form briefs into a single strict JSON object describing the production requirements for a short promotional video.",
      "visualDirection MUST define a fixed fictional cast (gender, age, hair, skin tone, wardrobe for each person) and ONE unchanging location/environment — these never change between shots.",
      "If the user provided instructions (do/don't constraints), honor them strictly in visualDirection and brandConstraints.",
      "If branding.businessName is set, keep the business name consistent in summary, callToAction, and tone — do not invent a competing brand.",
      "If attachments include role=anchor images, treat them as mandatory visual references for cast and/or setting/background — describe matching looks in visualDirection.",
      "If referenceVideoAnalysis is present, use only its reusable production language (style, pacing, camera, captions and story structure). Never copy its brand, characters, wording, logos or exact scenes.",
      userFacingLanguageInstruction(contentLang),
      `Set the JSON "language" field to "${contentLang}".`
    ].join(" ");

    const schemaHint = JSON.stringify(
      {
        title: `${langNative} title`,
        summary: `${langNative} summary`,
        targetAudience: `${langNative} target audience`,
        toneOfVoice: `${langNative} tone`,
        style: `${langNative} style`,
        durationSeconds: "integer 5..180",
        aspectRatio: "9:16 | 16:9 | 1:1",
        language: contentLang,
        brandConstraints: [`short ${langEn} constraint strings`],
        visualDirection: `${langNative} visual direction (cast + location)`,
        musicDirection: `${langNative} music direction`,
        callToAction: `${langNative} CTA (optional)`,
        references: [{ kind: "link|image|video|audio|text|other", ref: "string", note: "optional" }]
      },
      null,
      2
    );

    const creativeLines = formatCreativeConstraints(input.creative);
    const referenceVideo = (input.attachments ?? []).find((att) => att.role === "reference_video");
    let referenceVideoAnalysis: ReferenceVideoAnalysis | null = null;
    if (referenceVideo && provider.type === "GEMINI") {
      const match = referenceVideo.dataUrl?.trim().match(/^data:(video\/[^;]+);base64,(.+)$/);
      if (match) {
        try {
          const response = await geminiCompleteJson<ReferenceVideoAnalysis>(
            provider,
            {
              system:
                "You are a video creative analyst. Analyze the attached inspiration video for reusable production characteristics only. Do not copy or recommend copying its brand, people, copyrighted characters, exact wording, logo, music, or exact scene sequence.",
              user:
                "Return a concise production analysis that can guide a new original promotional video. Focus on visual style, palette, shot duration/rhythm, camera language, caption treatment, narrative structure, and reusable directions.",
              schemaName: "ReferenceVideoAnalysis",
              schemaHint: JSON.stringify({
                summary: "short neutral description",
                visualStyle: "lighting, rendering and composition",
                colorPalette: "dominant palette and contrast",
                shotRhythm: "estimated shot lengths and pacing",
                cameraLanguage: "shot sizes, angles and movement",
                captionStyle: "placement, hierarchy and visual treatment",
                storyStructure: "abstract narrative progression",
                reusableDirections: ["original production instruction"]
              }),
              temperature: 0.2,
              maxOutputTokens: 2048,
              media: {
                mimeType: match[1]!,
                dataBase64: match[2]!
              }
            },
            async (event) => {
              await ctx.cost.record(event);
            }
          );
          referenceVideoAnalysis = {
            summary: String(response.parsed.summary ?? ""),
            visualStyle: String(response.parsed.visualStyle ?? ""),
            colorPalette: String(response.parsed.colorPalette ?? ""),
            shotRhythm: String(response.parsed.shotRhythm ?? ""),
            cameraLanguage: String(response.parsed.cameraLanguage ?? ""),
            captionStyle: String(response.parsed.captionStyle ?? ""),
            storyStructure: String(response.parsed.storyStructure ?? ""),
            reusableDirections: Array.isArray(response.parsed.reusableDirections)
              ? response.parsed.reusableDirections.map(String).filter(Boolean)
              : []
          };
          await ctx.log.log("brief_reference_video_analyzed", "Reference video analyzed", {
            name: referenceVideo.name,
            model: response.model
          });
        } catch (error) {
          await ctx.log.log("brief_reference_video_analysis_failed", "Reference video analysis failed; continuing from text brief", {
            name: referenceVideo.name,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }
    // Never send attachment dataUrls/base64 to the LLM — a short voice/video sample
    // as text tokens easily exceeds the model context (1M) and fails with 400.
    const userPayload = JSON.stringify(
      {
        ...input,
        attachments: (input.attachments ?? []).map((att) => ({
          name: att.name,
          mimeType: att.mimeType,
          kind: att.kind,
          role: att.role,
          sceneIndex: att.sceneIndex,
          insertAtSeconds: att.insertAtSeconds,
          audioSource: att.audioSource,
          hasBinary: Boolean(att.dataUrl || att.gcsPath)
        })),
        creativeConstraints: creativeLines,
        referenceVideoAnalysis
      },
      null,
      2
    );

    const completeJson = provider.type === "GEMINI" ? geminiCompleteJson : llmCompleteJson;
    const { parsed, model } = await completeJson<BriefOutput>(
      provider,
      {
        system:
          system +
          (creativeLines.length
            ? " Honor creativeConstraints strictly in toneOfVoice, visualDirection, musicDirection, language, targetAudience, and style."
            : "") +
          ` User source text language should drive copy — prefer ${langEn}.`,
        user: userPayload,
        schemaName: "BriefOutput",
        schemaHint,
        temperature: 0.3
      },
      async (event) => {
        await ctx.cost.record(event);
      }
    );

    const visualAnchors: BriefOutput["visualAnchors"] = [];
    let voiceCloneSample: BriefOutput["voiceCloneSample"] = null;
    let videoInsert: BriefOutput["videoInsert"] = null;
    let logoAsset: NonNullable<BriefOutput["branding"]>["logo"] = null;

    for (const att of input.attachments ?? []) {
      if (att.role === "logo") {
        if (att.gcsPath) {
          logoAsset = {
            name: att.name,
            gcsPath: att.gcsPath,
            mimeType: att.mimeType || "image/png"
          };
          continue;
        }
        const dataUrl = att.dataUrl?.trim();
        if (!dataUrl?.startsWith("data:")) continue;
        const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) continue;
        const mimeType = match[1] || att.mimeType || "image/png";
        const body = Buffer.from(match[2]!, "base64");
        const saved = await ctx.artifacts.save({
          runId: ctx.runId,
          stage: "brief",
          kind: "scene_image_source",
          body,
          mimeType,
          filename: att.name || "business-logo.png",
          metadata: { role: "logo", source: "brief_input_attachment" }
        });
        logoAsset = {
          name: att.name,
          gcsPath: saved.gcsPath,
          mimeType
        };
        continue;
      }

      if (att.role === "reference_video") {
        if (att.gcsPath) continue;
        const dataUrl = att.dataUrl?.trim();
        const match = dataUrl?.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) continue;
        await ctx.artifacts.save({
          runId: ctx.runId,
          stage: "brief",
          kind: "scene_video_source",
          body: Buffer.from(match[2]!, "base64"),
          mimeType: match[1] || att.mimeType || "video/mp4",
          filename: att.name || "reference-video.mp4",
          metadata: {
            role: "reference_video",
            source: "brief_input_attachment",
            outputUsage: "analysis_only"
          }
        });
        continue;
      }

      if (att.role === "insert_clip") {
        const insertAtSeconds = Math.max(0, Number(att.insertAtSeconds ?? 0));
        const audioSource = att.audioSource === "narration" ? "narration" : "clip";
        if (att.gcsPath) {
          videoInsert = {
            name: att.name,
            gcsPath: att.gcsPath,
            mimeType: att.mimeType || "video/mp4",
            insertAtSeconds,
            audioSource
          };
          continue;
        }
        const dataUrl = att.dataUrl?.trim();
        if (!dataUrl?.startsWith("data:")) continue;
        const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) continue;
        const mimeType = match[1] || att.mimeType || "video/mp4";
        const body = Buffer.from(match[2]!, "base64");
        const saved = await ctx.artifacts.save({
          runId: ctx.runId,
          stage: "brief",
          kind: "scene_video_source",
          body,
          mimeType,
          filename: att.name || "video-insert.mp4",
          metadata: {
            role: "insert_clip",
            source: "brief_input_attachment",
            insertAtSeconds,
            audioSource
          }
        });
        videoInsert = {
          name: att.name,
          gcsPath: saved.gcsPath,
          mimeType,
          insertAtSeconds,
          audioSource
        };
        continue;
      }

      if (att.role === "voice_clone") {
        if (att.gcsPath) {
          voiceCloneSample = {
            name: att.name,
            gcsPath: att.gcsPath,
            mimeType: att.mimeType || "audio/mpeg"
          };
          continue;
        }
        const dataUrl = att.dataUrl?.trim();
        if (!dataUrl?.startsWith("data:")) continue;
        const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) continue;
        const mimeType = match[1] || att.mimeType || "audio/mpeg";
        const body = Buffer.from(match[2]!, "base64");
        const saved = await ctx.artifacts.save({
          runId: ctx.runId,
          stage: "brief",
          kind: "voice_clone_sample",
          body,
          mimeType,
          filename: att.name || "voice-clone-sample.mp3",
          metadata: { role: "voice_clone", source: "brief_input_attachment" }
        });
        voiceCloneSample = {
          name: att.name,
          gcsPath: saved.gcsPath,
          mimeType
        };
        continue;
      }

      if (att.role !== "anchor" && att.role !== "scene" && att.role !== "product") continue;

      if (att.gcsPath) {
        visualAnchors.push({
          name: att.name,
          gcsPath: att.gcsPath,
          mimeType: att.mimeType,
          role: att.role === "scene" ? "scene" : att.role === "product" ? "product" : "anchor"
        });
        continue;
      }
      const dataUrl = att.dataUrl?.trim();
      if (!dataUrl?.startsWith("data:")) continue;
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) continue;
      const mimeType = match[1] || att.mimeType || "image/png";
      const body = Buffer.from(match[2]!, "base64");
      const saved = await ctx.artifacts.save({
        runId: ctx.runId,
        stage: "brief",
        kind: att.kind === "video" ? "scene_video_source" : "scene_image_source",
        body,
        mimeType,
        filename: att.name || "visual-anchor.png",
        metadata: { role: att.role ?? "anchor", source: "brief_input_attachment" }
      });
      visualAnchors.push({
        name: att.name,
        gcsPath: saved.gcsPath,
        mimeType,
        role: att.role === "scene" ? "scene" : att.role === "product" ? "product" : "anchor"
      });
    }

    const creativeBlock = creativeLines.length ? `\nCreative constraints:\n- ${creativeLines.join("\n- ")}` : "";
    const instructions = input.instructions?.trim() || "";
    const instructionsBlock = instructions
      ? `\nUser instructions (MUST follow — do / don't):\n${instructions}`
      : "";
    const langFromCreative = languageCodeFromCreative(input.creative);
    // Creative / form language wins over LLM guess (models often return "he" for Yiddish).
    const resolvedLanguage = normalizeContentLanguage(
      langFromCreative ?? contentLang ?? input.language ?? parsed.language
    );
    const businessName = input.branding?.businessName?.trim() || "";
    const slogan = input.branding?.slogan?.trim() || "";
    const websiteUrlRaw = input.branding?.websiteUrl?.trim() || "";
    const websiteUrl = websiteUrlRaw
      ? /^https?:\/\//i.test(websiteUrlRaw)
        ? websiteUrlRaw
        : `https://${websiteUrlRaw}`
      : "";
    const creativeLogoPlacement = input.creative?.logoPlacement;
    const hasBusinessBrand = Boolean(businessName || slogan || logoAsset || websiteUrl);
    let logoPlacement: NonNullable<BriefOutput["branding"]>["logoPlacement"] | undefined;
    if (hasBusinessBrand) {
      if (creativeLogoPlacement === "none") logoPlacement = "none";
      else if (creativeLogoPlacement) logoPlacement = creativeLogoPlacement;
      else logoPlacement = "end_only";
    }
    const brandingOut: BriefOutput["branding"] = hasBusinessBrand
      ? {
          ...(businessName ? { businessName } : {}),
          ...(slogan ? { slogan } : {}),
          ...(websiteUrl ? { websiteUrl } : {}),
          logo: logoAsset,
          ...(logoPlacement ? { logoPlacement } : {})
        }
      : null;

    const endCardCredit =
      resolvedLanguage === "he" || resolvedLanguage === "yi"
        ? "בכרטיס הסיום יש לציין prompt2spot.com"
        : "End card must credit prompt2spot.com";
    const brandNameConstraint =
      businessName && (resolvedLanguage === "he" || resolvedLanguage === "yi")
        ? `שם העסק לשימוש עקבי בדיבוב וב-CTA: ${businessName}`
        : businessName
          ? `Use business name consistently in narration and CTA: ${businessName}`
          : null;
    const userInstructionsPrefix =
      resolvedLanguage === "he" || resolvedLanguage === "yi"
        ? "הוראות משתמש (חובה לכבד)"
        : "User instructions (MUST follow)";
    const anchorNote =
      visualAnchors.length > 0
        ? `User uploaded ${visualAnchors.length} character photo(s) — those people ARE the cast; preserve their faces in every scene.`
        : "";
    const referenceDirectionBlock = referenceVideoAnalysis
      ? [
          "Inspiration-video production guidance (create an original execution):",
          `Visual style: ${referenceVideoAnalysis.visualStyle}`,
          `Color palette: ${referenceVideoAnalysis.colorPalette}`,
          `Shot rhythm: ${referenceVideoAnalysis.shotRhythm}`,
          `Camera language: ${referenceVideoAnalysis.cameraLanguage}`,
          `Caption style: ${referenceVideoAnalysis.captionStyle}`,
          `Story structure: ${referenceVideoAnalysis.storyStructure}`,
          ...referenceVideoAnalysis.reusableDirections.map((direction) => `- ${direction}`)
        ].join("\n")
      : "";
    const enriched: BriefOutput = {
      title: parsed.title ?? input.title,
      summary: parsed.summary ?? "",
      targetAudience:
        input.creative?.targetAudience?.trim() ||
        parsed.targetAudience ||
        input.targetAudience ||
        "",
      toneOfVoice: [parsed.toneOfVoice ?? "", input.creative?.communicationStyle, input.creative?.speechStyle]
        .filter(Boolean)
        .join("; "),
      style:
        [parsed.style ?? input.style ?? "", input.creative?.designStyle, input.creative?.pace]
          .filter(Boolean)
          .join("; ") || "",
      durationSeconds: parsed.durationSeconds ?? input.durationSeconds,
      aspectRatio: aspectRatioFromCreative(input.creative) ?? parsed.aspectRatio ?? input.aspectRatio,
      language: resolvedLanguage,
      ...(instructions ? { instructions } : {}),
      brandConstraints: [
        ...(parsed.brandConstraints ?? []),
        ...(instructions ? [`${userInstructionsPrefix}: ${instructions}`] : []),
        ...creativeLines,
        ...(brandNameConstraint ? [brandNameConstraint] : []),
        ...(slogan
          ? [resolvedLanguage === "he" || resolvedLanguage === "yi" ? `סלוגן העסק: ${slogan}` : `Business slogan: ${slogan}`]
          : []),
        ...(anchorNote ? [anchorNote] : []),
        ...(referenceVideoAnalysis
          ? [
              "Use the inspiration video only for abstract production characteristics; do not copy its brand, characters, wording, logo or exact shots.",
              ...referenceVideoAnalysis.reusableDirections
            ]
          : []),
        endCardCredit
      ],
      visualDirection: `${parsed.visualDirection ?? ""}${creativeBlock}${instructionsBlock}${
        anchorNote ? `\n${anchorNote}` : ""
      }${referenceDirectionBlock ? `\n${referenceDirectionBlock}` : ""}`.trim(),
      musicDirection: [
        parsed.musicDirection ?? "",
        input.creative?.musicTempo ? `tempo: ${input.creative.musicTempo}` : "",
        input.creative?.musicVolumePercent != null
          ? `music volume ~${input.creative.musicVolumePercent}% under voice`
          : ""
      ]
        .filter(Boolean)
        .join("; "),
      callToAction: parsed.callToAction ?? businessName ?? "prompt2spot.com",
      budgetMode: input.budgetMode ?? false,
      renderProfile: (() => {
        const hasPhotoPlates =
          visualAnchors.length > 0 ||
          input.attachments.some((a) => a.role === "product" || a.role === "anchor");
        const falOk = Boolean(process.env.FAL_API_KEY?.trim());
        // Lip-sync toggle → cheap Kling Avatar on fal (HeyGen only if fal missing).
        if (creativeFlagOn(input.creative, "preferHeygenDub")) {
          return falOk ? "kling-avatar-i2v" : "heygen-i2v";
        }
        // Character or product photos need image→video; Veo Fast ignores reference frames.
        if (hasPhotoPlates && falOk) return "wan-i2v";
        return resolveRenderProfile(input).id;
      })(),
      references:
        parsed.references ??
        input.referenceLinks.map((link) => ({ kind: "link" as const, ref: link, note: undefined })),
      visualAnchors,
      voiceCloneSample,
      videoInsert,
      referenceVideoAnalysis,
      branding: brandingOut,
      ttsVoiceName:
        geminiVoiceNameFromCreative(input.creative) ?? defaultGeminiVoiceForLanguage(resolvedLanguage),
      ...(input.creative ? { creative: input.creative } : {})
    };

    await ctx.artifacts.save({
      runId: ctx.runId,
      stage: "brief",
      kind: "brief_output",
      body: JSON.stringify(enriched, null, 2),
      mimeType: "application/json",
      filename: "brief-output.json",
      metadata: { model, provider: provider.provider }
    });
    await ctx.log.log("brief_done", "Brief Agent finished", { provider: provider.provider, model });
    return enriched;
  }
};

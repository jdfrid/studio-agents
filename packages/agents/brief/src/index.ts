import { geminiCompleteJson, llmCompleteJson } from "@studio/providers";
import {
  BriefInputSchema,
  BriefOutputSchema,
  NoProviderConfiguredError,
  aspectRatioFromCreative,
  formatCreativeConstraints,
  geminiVoiceNameFromCreative,
  languageCodeFromCreative,
  resolveRenderProfile,
  type Agent,
  type BriefInput,
  type BriefOutput
} from "@studio/shared";

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

    const system =
      "You are a senior creative producer. Convert free-form briefs into a single strict JSON object describing the production requirements for a short promotional video. visualDirection MUST define a fixed fictional cast (gender, age, hair, skin tone, wardrobe for each person) and ONE unchanging location/environment — these never change between shots.";
    const schemaHint = JSON.stringify(
      {
        title: "string",
        summary: "string",
        targetAudience: "string",
        toneOfVoice: "string",
        style: "string",
        durationSeconds: "integer 5..180",
        aspectRatio: "9:16 | 16:9 | 1:1",
        language: "string",
        brandConstraints: ["string"],
        visualDirection: "string",
        musicDirection: "string",
        callToAction: "string (optional)",
        references: [{ kind: "link|image|video|audio|text|other", ref: "string", note: "optional" }]
      },
      null,
      2
    );

    const creativeLines = formatCreativeConstraints(input.creative);
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
        creativeConstraints: creativeLines
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
            : ""),
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

    for (const att of input.attachments ?? []) {
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

      if (att.gcsPath) {
        visualAnchors.push({
          name: att.name,
          gcsPath: att.gcsPath,
          mimeType: att.mimeType,
          role: att.role === "scene" ? "scene" : "anchor"
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
        role: att.role === "scene" ? "scene" : "anchor"
      });
    }

    const creativeBlock = creativeLines.length ? `\nCreative constraints:\n- ${creativeLines.join("\n- ")}` : "";
    const langFromCreative = languageCodeFromCreative(input.creative);
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
      language: langFromCreative ?? parsed.language ?? input.language,
      brandConstraints: [
        ...(parsed.brandConstraints ?? []),
        ...creativeLines,
        "End card must credit prompt2spot.com"
      ],
      visualDirection: `${parsed.visualDirection ?? ""}${creativeBlock}`.trim(),
      musicDirection: [
        parsed.musicDirection ?? "",
        input.creative?.musicTempo ? `tempo: ${input.creative.musicTempo}` : "",
        input.creative?.musicVolumePercent != null
          ? `music volume ~${input.creative.musicVolumePercent}% under voice`
          : ""
      ]
        .filter(Boolean)
        .join("; "),
      callToAction: parsed.callToAction ?? "prompt2spot.com",
      budgetMode: input.budgetMode ?? false,
      renderProfile: resolveRenderProfile(input).id,
      references:
        parsed.references ??
        input.referenceLinks.map((link) => ({ kind: "link" as const, ref: link, note: undefined })),
      visualAnchors,
      voiceCloneSample,
      videoInsert,
      ttsVoiceName: geminiVoiceNameFromCreative(input.creative) ?? null
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

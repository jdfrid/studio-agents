import { geminiCompleteJson, llmCompleteJson } from "@studio/providers";
import {
  BriefInputSchema,
  BriefOutputSchema,
  NoProviderConfiguredError,
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
      "You are a senior creative producer. Convert free-form briefs into a single strict JSON object describing the production requirements for a short promotional video.";
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

    const userPayload = JSON.stringify(input, null, 2);

    const completeJson = provider.type === "GEMINI" ? geminiCompleteJson : llmCompleteJson;
    const { parsed, model } = await completeJson<BriefOutput>(
      provider,
      {
        system,
        user: userPayload,
        schemaName: "BriefOutput",
        schemaHint,
        temperature: 0.3
      },
      async (event) => {
        await ctx.cost.record(event);
      }
    );

    const enriched: BriefOutput = {
      title: parsed.title ?? input.title,
      summary: parsed.summary ?? "",
      targetAudience: parsed.targetAudience ?? input.targetAudience ?? "",
      toneOfVoice: parsed.toneOfVoice ?? "",
      style: parsed.style ?? input.style ?? "",
      durationSeconds: parsed.durationSeconds ?? input.durationSeconds,
      aspectRatio: parsed.aspectRatio ?? input.aspectRatio,
      language: parsed.language ?? input.language,
      brandConstraints: parsed.brandConstraints ?? [],
      visualDirection: parsed.visualDirection ?? "",
      musicDirection: parsed.musicDirection ?? "",
      callToAction: parsed.callToAction,
      budgetMode: input.budgetMode ?? false,
      references:
        parsed.references ??
        input.referenceLinks.map((link) => ({ kind: "link" as const, ref: link, note: undefined }))
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

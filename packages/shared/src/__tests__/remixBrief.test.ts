import { describe, expect, it } from "vitest";
import { BriefInputSchema } from "../schemas/brief.js";
import { remixFormFromBrief } from "../remixBrief.js";

describe("remixFormFromBrief", () => {
  it("restores structured fields including time of day and reusable attachments", () => {
    const brief = BriefInputSchema.parse({
      title: "Summer sale",
      sourceText: [
        "Video goal: Promote a product",
        "Gold watches on a sunny terrace",
        "Desired viewer action: Buy",
        "Required mood: Premium, Dramatic",
        "Target platform: Instagram Reels"
      ].join("\n"),
      instructions: [
        "Keep the logo in frame",
        "No background music.",
        "Do not show in the video: competitors"
      ].join("\n"),
      targetAudience: "Watch collectors",
      durationSeconds: 45,
      language: "en",
      approvalMode: "auto_until_render",
      creative: {
        timeOfDay: "יום",
        location: "חוף ים",
        karaokeCaptions: "on",
        language: "en"
      },
      branding: { businessName: "Luxy", primaryColor: "#C9A227" },
      attachments: [
        {
          name: "hero.png",
          mimeType: "image/png",
          kind: "image",
          role: "anchor",
          gcsPath: "runs/parent/brief/hero.png"
        }
      ]
    });

    const form = remixFormFromBrief(brief);
    expect(form.title).toBe("Summer sale");
    expect(form.videoGoal).toBe("product");
    expect(form.prompt).toBe("Gold watches on a sunny terrace");
    expect(form.desiredAction).toBe("buy");
    expect(form.moods).toEqual(["luxury", "dramatic"]);
    expect(form.platform).toBe("instagram_reels");
    expect(form.musicMode).toBe("none");
    expect(form.instructions).toBe("Keep the logo in frame");
    expect(form.exclusions).toBe("competitors");
    expect(form.creative.timeOfDay).toBe("יום");
    expect(form.creative.location).toBe("חוף ים");
    expect(form.businessName).toBe("Luxy");
    expect(form.keptAttachments).toEqual([
      {
        name: "hero.png",
        mimeType: "image/png",
        kind: "image",
        role: "anchor",
        gcsPath: "runs/parent/brief/hero.png"
      }
    ]);
  });

  it("resolves Hebrew labels and attachment paths from brief output", () => {
    const brief = BriefInputSchema.parse({
      title: "לילה",
      sourceText: ["מטרת הסרטון: פרסום שירות", "המסעדה בלילה", "פלטפורמת יעד: TikTok"].join("\n"),
      durationSeconds: 30,
      language: "he",
      attachments: [
        { name: "chef.jpg", mimeType: "image/jpeg", kind: "image", role: "anchor" }
      ]
    });
    const form = remixFormFromBrief(brief, {
      visualAnchors: [
        { name: "chef.jpg", gcsPath: "runs/a/chef.jpg", mimeType: "image/jpeg", role: "anchor" }
      ]
    });
    expect(form.videoGoal).toBe("service");
    expect(form.prompt).toBe("המסעדה בלילה");
    expect(form.platform).toBe("tiktok");
    expect(form.keptAttachments[0]?.gcsPath).toBe("runs/a/chef.jpg");
  });
});

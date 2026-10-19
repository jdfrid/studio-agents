import { addDays, isoDate, zonedToUtc } from "./time.js";

export type AssetKind = "short" | "linkedin" | "email" | "youtube" | "article";

export type CalendarWeek = {
  week: number;
  goal: string;
  cta: string;
  assets: string[];
};

export const CALENDAR: CalendarWeek[] = [
  {
    week: 1,
    goal: "Establish that generated clips are not the same as a finished business-video workflow.",
    cta: "Watch the full workflow demo.",
    assets: [
      "The difference between generating a clip and producing an ad.",
      "Screen capture of brief, script, voice, asset and render.",
      "Stop moving one project between five AI tools.",
      "LinkedIn: the hidden operational cost of DIY AI-video stacks.",
      "Email: Why we built Reelmino."
    ]
  },
  {
    week: 2,
    goal: "Demonstrate source-photo transformation.",
    cta: "Send one product page for a suggested concept.",
    assets: [
      "Final result first: product ad.",
      "Before and after: three product photos to final scenes.",
      "Educational: writing a product-video brief.",
      "Comparison: generic AI prompt vs a structured business brief.",
      "LinkedIn case study: actual run stages, cost and work time."
    ]
  },
  {
    week: 3,
    goal: "Reach restaurants, clinics, services and retail.",
    cta: "Create your first 30-second video.",
    assets: [
      "Restaurant offer video.",
      "Local service before and after.",
      "One weekly offer, one repeatable video workflow.",
      "FAQ: Do I need professional product photography?",
      "LinkedIn: repeatability beats one viral video."
    ]
  },
  {
    week: 4,
    goal: "Open agency conversations.",
    cta: "Book an agency workflow demo.",
    assets: [
      "Five briefs, one production structure.",
      "Approval-mode walkthrough.",
      "Where agency margin disappears.",
      "Case study: one concept adapted for two client formats.",
      "YouTube tutorial: complete agency workflow."
    ]
  },
  {
    week: 5,
    goal: "Qualify buyers and build trust.",
    cta: "See pricing and the revision policy.",
    assets: [
      "Standard video vs optional lip-sync.",
      "Why lip-sync is optional, not bundled.",
      "Run-cost ledger walkthrough.",
      "Technical retry vs creative revision.",
      "LinkedIn: how to price AI-video production sustainably."
    ]
  },
  {
    week: 6,
    goal: "Test a visually strong vertical.",
    cta: "Turn one listing into a video concept.",
    assets: [
      "Property hero short.",
      "Agent photo or voice-over concept.",
      "Listing photos to a social video.",
      "Three hooks for the same property.",
      "Case study: turnaround and output variants."
    ]
  },
  {
    week: 7,
    goal: "Validate the corporate-product preset.",
    cta: "Watch the full B2B product-film breakdown.",
    assets: [
      "Hook, problem, product, benefits and CTA.",
      "Product screenshots as locked B-roll plates.",
      "Lower-third and brand walkthrough.",
      "AI video does not have to look like an avatar demo.",
      "LinkedIn: when a longer B2B film is worth more than a short."
    ]
  },
  {
    week: 8,
    goal: "Answer consistency objections.",
    cta: "Review the workflow before you buy.",
    assets: [
      "How source images anchor the cast and product.",
      "Approval stages in 20 seconds.",
      "What we can and cannot guarantee.",
      "Closed-mouth voice-over vs true lip-sync.",
      "FAQ compilation."
    ]
  },
  {
    week: 9,
    goal: "Replace portfolio claims with real evidence.",
    cta: "Apply for the next design-partner slot.",
    assets: [
      "Customer final video.",
      "Customer source assets and brief.",
      "Customer quote on time saved.",
      "Revision count and production cost.",
      "LinkedIn full case study."
    ]
  },
  {
    week: 10,
    goal: "Convert people who already experiment with AI video.",
    cta: "Try the workflow, not just another model.",
    assets: [
      "Five-tool stack vs the Reelmino workflow.",
      "Time-lapse of manual handoffs.",
      "You can do it yourself. Here is what you still manage.",
      "Result comparison with the same brief.",
      "YouTube: transparent end-to-end challenge."
    ]
  },
  {
    week: 11,
    goal: "Show operational leverage for agencies.",
    cta: "Join the live agency demo.",
    assets: [
      "Capacity model: editor hours vs a structured workflow.",
      "Three client niches from one process.",
      "Approval and revision boundaries.",
      "Pricing a client video with margin.",
      "Webinar invitation."
    ]
  },
  {
    week: 12,
    goal: "Test a second language with evidence, not a literal translation.",
    cta: "Request a market and language example.",
    assets: [
      "One concept in English and one validated second language.",
      "Voice and caption comparison.",
      "Localized hook, not a literal translation.",
      "What changes when the market changes?",
      "Case-study page in the winning secondary language."
    ]
  },
  {
    week: 13,
    goal: "Publish what was learned and invite the next cohort.",
    cta: "Join the next customer or agency cohort.",
    assets: [
      "90-day result reel.",
      "Best-performing video, remade.",
      "Three lessons from creatives that did not hold.",
      "Customer montage.",
      "Founder post: what Reelmino is focusing on next."
    ]
  }
];

export const SCRIPT_STARTERS = [
  {
    slug: "script-a-outcome",
    title: "Script A — Outcome first",
    body: "0–2s: finished scene. On-screen: this started as product photos.\n2–7s: source photos and a one-line brief.\n7–17s: script, voice, scenes, render.\n17–25s: final video.\nCTA: Watch the full prompt-to-result breakdown.\n\nDo not state a production time unless it was measured."
  },
  {
    slug: "script-b-diy",
    title: "Script B — DIY comparison",
    body: "0–2s: Five AI tools. One 30-second ad.\n2–10s: manual handoffs between script, voice, image, video and an editor.\n10–20s: the Reelmino stage flow.\n20–27s: both results. Mention work time only when it was measured.\nCTA: Choose the workflow you want to manage."
  },
  {
    slug: "script-c-agency",
    title: "Script C — Agency",
    body: "0–2s: Agency owners: AI does not fix a broken production workflow.\n2–8s: three client briefs.\n8–20s: one stage structure and approvals.\n20–27s: three outputs.\nCTA: Book the agency workflow demo."
  },
  {
    slug: "script-d-lipsync",
    title: "Script D — Lip-sync economics",
    body: "0–3s: Do you actually need lip-sync in this ad?\n3–11s: voice-over concept.\n11–19s: talking-character concept.\n19–25s: lip-sync is optional and should serve the message.\nCTA: See pricing before choosing. Do not quote a price that is not on the live pricing page."
  }
];

export function assetKind(title: string): AssetKind {
  const text = title.toLowerCase();
  if (text.startsWith("linkedin") || text.includes("founder post")) return "linkedin";
  if (text.startsWith("email") || text.includes("webinar")) return "email";
  if (text.startsWith("youtube")) return "youtube";
  if (text.includes("case-study page")) return "article";
  return "short";
}

export function networksForKind(kind: AssetKind): string[] {
  if (kind === "short") return ["youtube", "instagram", "facebook", "tiktok", "telegram"];
  if (kind === "linkedin") return ["linkedin"];
  if (kind === "email") return ["email"];
  if (kind === "youtube") return ["youtube"];
  return ["site"];
}

export function slotWhen(kind: AssetKind, shortOrdinal: number): { day: number; hour: number } {
  if (kind === "short") {
    const days = [0, 1, 2, 4];
    return { day: days[shortOrdinal] ?? 4, hour: 9 };
  }
  if (kind === "linkedin") return { day: 3, hour: 9 };
  if (kind === "email") return { day: 3, hour: 8 };
  if (kind === "youtube") return { day: 4, hour: 16 };
  return { day: 2, hour: 12 };
}

export function slotInstant(startMonday: string, week: number, dayOffset: number, hour: number): string {
  const parts = addDays(startMonday, (week - 1) * 7 + dayOffset);
  return zonedToUtc(parts.y, parts.m, parts.d, hour, 0, "Asia/Jerusalem").toISOString();
}

export function weekStartLabel(startMonday: string, week: number): string {
  return isoDate(addDays(startMonday, (week - 1) * 7));
}

export type SlotOrigin = "calendar" | "manual";
export type SlotDecision = "publish" | "needs_review" | "skipped";

export function decideSlot(input: {
  network: string;
  origin: SlotOrigin;
  destination: { enabled: boolean; autopilot: boolean } | null;
  emailAutopilot: boolean;
  siteAutopilot: boolean;
}): SlotDecision {
  if (input.network === "email") {
    if (input.origin === "manual" || input.emailAutopilot) return "publish";
    return "needs_review";
  }
  if (input.network === "site") {
    if (input.origin === "manual" || input.siteAutopilot) return "publish";
    return "needs_review";
  }
  if (!input.destination) return "needs_review";
  if (!input.destination.enabled) return "skipped";
  if (input.origin === "manual" || input.destination.autopilot) return "publish";
  return "needs_review";
}

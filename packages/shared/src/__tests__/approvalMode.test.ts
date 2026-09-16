import { describe, expect, it } from "vitest";
import { stageRequiresApproval } from "../schemas/run.js";

describe("stageRequiresApproval", () => {
  it("runs every stage in automatic mode", () => {
    expect(stageRequiresApproval("script", "auto")).toBe(false);
    expect(stageRequiresApproval("render", "auto")).toBe(false);
  });

  it("pauses after the script proposal in the default review mode", () => {
    expect(stageRequiresApproval("brief", "auto_until_render")).toBe(false);
    expect(stageRequiresApproval("script", "auto_until_render")).toBe(true);
    expect(stageRequiresApproval("audio", "auto_until_render")).toBe(false);
    expect(stageRequiresApproval("render", "auto_until_render")).toBe(false);
  });

  it("keeps per-stage gates in manual mode", () => {
    expect(stageRequiresApproval("script", "manual")).toBe(true);
    expect(stageRequiresApproval("asset", "manual")).toBe(true);
    expect(stageRequiresApproval("audio", "manual")).toBe(false);
  });
});

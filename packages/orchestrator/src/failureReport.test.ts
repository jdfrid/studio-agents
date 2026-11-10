import { describe, expect, it } from "vitest";
import { describeProductionFailure } from "./failureReport.js";

describe("describeProductionFailure", () => {
  it("names the video, the missing stage, and the free video", () => {
    const report = describeProductionFailure({
      runId: "run_1",
      title: "מתכון מהיר",
      userEmail: "user@example.com",
      userName: "דנה",
      stage: "render",
      language: "he",
      freeVideoGranted: true,
      stages: [
        { stage: "script", status: "COMPLETED", error: null },
        { stage: "render", status: "FAILED", error: "heygen timeout" }
      ]
    });
    expect(report.subject).toContain("מתכון מהיר");
    expect(report.text).toContain("https://reelmino.com/runs/run_1");
    expect(report.text).toContain("user@example.com");
    expect(report.text).toContain("סרטון נכשל: heygen timeout");
    expect(report.text).toContain("סרטון חינם נוסף: כן");
  });
});

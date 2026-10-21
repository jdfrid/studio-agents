import { describe, expect, it } from "vitest";
import { becameReady } from "./readyBeep.js";

describe("becameReady", () => {
  it("is true only on the first transition into COMPLETED", () => {
    expect(becameReady("RUNNING", "COMPLETED")).toBe(true);
    expect(becameReady("QUEUED", "COMPLETED")).toBe(true);
    expect(becameReady("AWAITING_APPROVAL", "COMPLETED")).toBe(true);
  });

  it("does not chime on first load of an already finished video", () => {
    expect(becameReady(null, "COMPLETED")).toBe(false);
    expect(becameReady(undefined, "COMPLETED")).toBe(false);
  });

  it("ignores later polls and failures", () => {
    expect(becameReady("COMPLETED", "COMPLETED")).toBe(false);
    expect(becameReady("RUNNING", "FAILED")).toBe(false);
    expect(becameReady("RUNNING", "RUNNING")).toBe(false);
  });
});

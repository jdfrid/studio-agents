import { describe, expect, it } from "vitest";
import { closeTruncatedJson, parseJsonObjectWithRepair } from "../jsonParse.js";

describe("parseJsonObjectWithRepair", () => {
  it("parses clean JSON", () => {
    const out = parseJsonObjectWithRepair<{ a: number }>('{"a":1}');
    expect(out.a).toBe(1);
  });

  it("strips markdown fences", () => {
    const out = parseJsonObjectWithRepair<{ x: string }>("```json\n{\"x\":\"hi\"}\n```");
    expect(out.x).toBe("hi");
  });

  it("fixes trailing commas", () => {
    const out = parseJsonObjectWithRepair<{ scenes: number[] }>('{"scenes":[1,2,],}');
    expect(out.scenes).toEqual([1, 2]);
  });

  it("closes truncated scene arrays", () => {
    const broken =
      '{"scenes":[{"title":"A","narration":"hello"},{"title":"B","narration":"world","visualPrompt":"x"';
    const out = parseJsonObjectWithRepair<{ scenes: Array<{ title: string }> }>(broken);
    expect(out.scenes.length).toBeGreaterThanOrEqual(1);
    expect(out.scenes[0]?.title).toBe("A");
  });

  it("closeTruncatedJson balances brackets", () => {
    const fixed = closeTruncatedJson('{"scenes":[{"a":1}');
    expect(JSON.parse(fixed)).toEqual({ scenes: [{ a: 1 }] });
  });
});

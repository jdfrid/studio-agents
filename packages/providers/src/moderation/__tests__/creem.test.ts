import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ContentModerationError,
  moderateUserText,
  moderationChunks,
  moderationText,
  strictestDecision,
  stringLeaves
} from "../creem.js";

const previousKey = process.env.CREEM_API_KEY;

afterEach(() => {
  if (previousKey === undefined) delete process.env.CREEM_API_KEY;
  else process.env.CREEM_API_KEY = previousKey;
});

function respond(decision: string, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify({ decision, usage: { units: 1 } }), { status }));
}

describe("moderation text helpers", () => {
  it("drops empty and duplicate parts", () => {
    expect(moderationText(["  a ", "", null, "a", "b"])).toBe("a\nb");
  });

  it("chunks long text on whitespace", () => {
    const text = Array.from({ length: 3000 }, (_, i) => `word${i}`).join(" ");
    const chunks = moderationChunks(text, 4000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 4000)).toBe(true);
    expect(chunks.join(" ")).toBe(text);
  });

  it("picks the strictest decision", () => {
    expect(strictestDecision(["allow", "flag"])).toBe("flag");
    expect(strictestDecision(["flag", "deny", "allow"])).toBe("deny");
    expect(strictestDecision(["allow"])).toBe("allow");
  });

  it("collects nested string leaves", () => {
    expect(stringLeaves({ a: "x", b: [1, "y", { c: "z" }] })).toEqual(["x", "y", "z"]);
  });
});

describe("moderateUserText", () => {
  it("is a no-op without a Creem key", async () => {
    delete process.env.CREEM_API_KEY;
    const fetchImpl = respond("deny");
    await expect(moderateUserText(["anything"], "u", { fetchImpl })).resolves.toMatchObject({ decision: "allow" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("allows clean text and targets the sandbox for test keys", async () => {
    process.env.CREEM_API_KEY = "creem_test_x";
    const fetchImpl = respond("allow");
    await expect(moderateUserText(["סרטון על קפה"], "user_1:run_create", { fetchImpl })).resolves.toMatchObject({
      decision: "allow",
      units: 1
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://test-api.creem.io/v1/moderation/prompt");
    expect(JSON.parse(String(init.body))).toEqual({ prompt: "סרטון על קפה", external_id: "user_1:run_create" });
  });

  it.each(["flag", "deny"])("blocks %s decisions", async (decision) => {
    process.env.CREEM_API_KEY = "creem_x";
    await expect(moderateUserText(["bad"], "u", { fetchImpl: respond(decision) })).rejects.toMatchObject({
      code: "prompt_rejected",
      decision
    });
  });

  it("fails closed when Creem errors", async () => {
    process.env.CREEM_API_KEY = "creem_x";
    const fetchImpl = respond("allow", 503);
    const error = await moderateUserText(["text"], "u", { fetchImpl }).catch((e) => e);
    expect(error).toBeInstanceOf(ContentModerationError);
    expect(error.code).toBe("moderation_unavailable");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("fails closed on an unknown decision", async () => {
    process.env.CREEM_API_KEY = "creem_x";
    await expect(moderateUserText(["text"], "u", { fetchImpl: respond("maybe") })).rejects.toMatchObject({
      code: "moderation_unavailable"
    });
  });
});

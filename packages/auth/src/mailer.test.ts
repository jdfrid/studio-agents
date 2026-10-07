import { afterEach, describe, expect, it } from "vitest";
import { mailConfigured, mailFrom, mailInbox } from "./mailer.js";

const KEYS = ["MAIL_FROM", "MAIL_INBOX", "RESEND_API_KEY", "SMTP_HOST", "SMTP_USER", "SMTP_PASS"] as const;

describe("mailer addresses", () => {
  const previous: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const key of KEYS) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });

  function snapshotEnv() {
    for (const key of KEYS) previous[key] = process.env[key];
    for (const key of KEYS) delete process.env[key];
  }

  it("defaults from/inbox to info@reelmino.com", () => {
    snapshotEnv();
    expect(mailFrom()).toBe("Reelmino <info@reelmino.com>");
    expect(mailInbox()).toBe("info@reelmino.com");
    expect(mailConfigured()).toBe(false);
  });

  it("uses MAIL_FROM and MAIL_INBOX when set", () => {
    snapshotEnv();
    process.env.MAIL_FROM = "Reelmino <hello@reelmino.com>";
    process.env.MAIL_INBOX = "hello@reelmino.com";
    expect(mailFrom()).toBe("Reelmino <hello@reelmino.com>");
    expect(mailInbox()).toBe("hello@reelmino.com");
  });

  it("treats Resend as configured mail", () => {
    snapshotEnv();
    process.env.RESEND_API_KEY = "re_test";
    expect(mailConfigured()).toBe(true);
  });
});

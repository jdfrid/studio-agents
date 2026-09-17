import { describe, expect, it } from "vitest";
import { hashOtp, hashPassword, isValidEmail, isValidPassword, verifyPassword } from "./password.js";

describe("email password helpers", () => {
  it("accepts a normal email and rejects junk", () => {
    expect(isValidEmail("jdfrid@gmail.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
  });

  it("requires 8–200 character passwords", () => {
    expect(isValidPassword("short")).toBe(false);
    expect(isValidPassword("longenough")).toBe(true);
  });

  it("hashes and verifies scrypt passwords", async () => {
    const stored = await hashPassword("correct-horse");
    await expect(verifyPassword("correct-horse", stored)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", stored)).resolves.toBe(false);
  });

  it("hashes OTP codes with the jwt secret", () => {
    process.env.JWT_SECRET = "otp-test-secret";
    const a = hashOtp("a@example.com", "123456");
    const b = hashOtp("a@example.com", "123456");
    const c = hashOtp("a@example.com", "000000");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(64);
  });
});

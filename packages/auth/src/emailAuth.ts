import { prisma } from "@studio/infra-prisma";
import { MailNotConfiguredError, mailConfigured, sendOtpEmail } from "./mailer.js";
import {
  generateOtpCode,
  hashOtp,
  hashPassword,
  isValidEmail,
  isValidPassword,
  normalizeEmail,
  verifyPassword
} from "./password.js";
import { consumeLimit } from "./rateLimit.js";
import { timingSafeEqual } from "node:crypto";
import { createEmailUser, getUserByEmail, getUserViewWithCredits, setUserPasswordHash } from "./users.js";
import type { UserView } from "@studio/shared";

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export type EmailAuthError =
  | "invalid_email"
  | "invalid_password"
  | "invalid_credentials"
  | "use_google"
  | "rate_limited"
  | "mail_not_configured"
  | "otp_invalid"
  | "otp_expired";

export class EmailAuthFailed extends Error {
  constructor(public readonly code: EmailAuthError, public readonly status: number) {
    super(code);
    this.name = "EmailAuthFailed";
  }
}

export async function startEmailAuth(input: {
  email: string;
  password: string;
  locale?: string;
  ip?: string;
}): Promise<{ ok: true }> {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) throw new EmailAuthFailed("invalid_email", 400);
  if (!isValidPassword(input.password)) throw new EmailAuthFailed("invalid_password", 400);
  if (!mailConfigured()) throw new EmailAuthFailed("mail_not_configured", 503);
  if (!consumeLimit(`email-start:${email}`, 5, 15 * 60_000) || !consumeLimit(`email-start-ip:${input.ip ?? "unknown"}`, 12, 15 * 60_000)) {
    throw new EmailAuthFailed("rate_limited", 429);
  }

  const existing = await getUserByEmail(email);
  let purpose: "login" | "signup" | "set_password" = "signup";
  let passwordHash: string | null = null;

  if (existing) {
    if (existing.passwordHash) {
      const ok = await verifyPassword(input.password, existing.passwordHash);
      if (!ok) throw new EmailAuthFailed("invalid_credentials", 401);
      purpose = "login";
    } else {
      purpose = "set_password";
      passwordHash = await hashPassword(input.password);
    }
  } else {
    passwordHash = await hashPassword(input.password);
  }

  const code = generateOtpCode();
  await prisma.emailOtp.deleteMany({ where: { email } });
  await prisma.emailOtp.create({
    data: {
      email,
      codeHash: hashOtp(email, code),
      passwordHash,
      purpose,
      expiresAt: new Date(Date.now() + OTP_TTL_MS)
    }
  });

  const locale = input.locale?.startsWith("he") ? "he" : "en";
  try {
    await sendOtpEmail(email, code, locale);
  } catch (err) {
    if (err instanceof MailNotConfiguredError) throw new EmailAuthFailed("mail_not_configured", 503);
    throw err;
  }
  return { ok: true };
}

export async function verifyEmailAuth(input: { email: string; code: string }): Promise<UserView> {
  const email = normalizeEmail(input.email);
  const code = input.code.trim();
  if (!isValidEmail(email) || !/^\d{6}$/.test(code)) throw new EmailAuthFailed("otp_invalid", 400);
  if (!consumeLimit(`email-verify:${email}`, 10, 15 * 60_000)) throw new EmailAuthFailed("rate_limited", 429);

  const otp = await prisma.emailOtp.findFirst({
    where: { email },
    orderBy: { createdAt: "desc" }
  });
  if (!otp) throw new EmailAuthFailed("otp_invalid", 400);
  if (otp.expiresAt.getTime() < Date.now()) {
    await prisma.emailOtp.delete({ where: { id: otp.id } }).catch(() => undefined);
    throw new EmailAuthFailed("otp_expired", 400);
  }
  if (otp.attempts >= MAX_ATTEMPTS) throw new EmailAuthFailed("otp_expired", 400);

  const expected = Buffer.from(otp.codeHash, "hex");
  const given = Buffer.from(hashOtp(email, code), "hex");
  const matches = expected.length === given.length && timingSafeEqual(expected, given);
  if (!matches) {
    await prisma.emailOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw new EmailAuthFailed("otp_invalid", 400);
  }

  let userId: string;
  if (otp.purpose === "signup") {
    if (!otp.passwordHash) throw new EmailAuthFailed("otp_invalid", 400);
    try {
      const created = await createEmailUser(email, otp.passwordHash);
      userId = created.id;
    } catch (err) {
      const existing = await getUserByEmail(email);
      if (!existing || (err as { code?: string }).code !== "P2002") throw err;
      userId = existing.id;
    }
  } else if (otp.purpose === "set_password") {
    if (!otp.passwordHash) throw new EmailAuthFailed("otp_invalid", 400);
    const existing = await getUserByEmail(email);
    if (!existing) throw new EmailAuthFailed("otp_invalid", 400);
    await setUserPasswordHash(existing.id, otp.passwordHash);
    userId = existing.id;
  } else {
    const existing = await getUserByEmail(email);
    if (!existing) throw new EmailAuthFailed("otp_invalid", 400);
    userId = existing.id;
  }

  await prisma.emailOtp.deleteMany({ where: { email } });
  const view = await getUserViewWithCredits(userId);
  if (!view) throw new EmailAuthFailed("otp_invalid", 400);
  return view;
}

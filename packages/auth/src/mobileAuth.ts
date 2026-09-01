import { createHash, randomBytes, randomUUID } from "node:crypto";
import { prisma } from "@studio/infra-prisma";
import { signMobileAccess } from "./jwt.js";

const AUTH_CODE_TTL_MS = 60_000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1_000;

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function opaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function mobileRedirectUri(): string {
  const uri = process.env.MOBILE_ADMIN_REDIRECT_URI?.trim() || "studioadmin://oauth/callback";
  const parsed = new URL(uri);
  if (parsed.protocol !== "studioadmin:" || parsed.username || parsed.password) {
    throw new Error("MOBILE_ADMIN_REDIRECT_URI must use the studioadmin: custom scheme");
  }
  return uri;
}

export async function createMobileAuthCode(userId: string, deviceId?: string): Promise<string> {
  const code = opaqueToken(24);
  await prisma.mobileAuthCode.create({
    data: {
      userId,
      codeHash: hash(code),
      deviceId: deviceId?.slice(0, 200),
      expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS)
    }
  });
  return code;
}

async function issueTokenPair(
  user: { id: string; email: string; role: "USER" | "ADMIN" },
  deviceId: string,
  familyId: string = randomUUID()
) {
  if (user.role !== "ADMIN") throw new Error("admin_required");
  const refreshToken = opaqueToken(48);
  await prisma.$transaction([
    prisma.mobileRefreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: hash(refreshToken),
        deviceId,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS)
      }
    }),
    prisma.adminDevice.upsert({
      where: { userId_deviceId: { userId: user.id, deviceId } },
      create: { userId: user.id, deviceId },
      update: { revokedAt: null, lastSeenAt: new Date() }
    })
  ]);
  return {
    accessToken: await signMobileAccess({
      sub: user.id,
      email: user.email,
      role: user.role,
      tokenUse: "mobile_access"
    }),
    refreshToken,
    expiresIn: 900,
    tokenType: "Bearer" as const
  };
}

export async function exchangeMobileAuthCode(code: string, deviceId: string) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const row = await tx.mobileAuthCode.findUnique({
      where: { codeHash: hash(code) },
      include: { user: true }
    });
    if (
      !row ||
      row.consumedAt ||
      row.expiresAt <= now ||
      (row.deviceId && row.deviceId !== deviceId) ||
      row.user.role !== "ADMIN"
    ) {
      throw new Error("invalid_mobile_auth_code");
    }
    const consumed = await tx.mobileAuthCode.updateMany({
      where: { id: row.id, consumedAt: null },
      data: { consumedAt: now }
    });
    if (consumed.count !== 1) throw new Error("invalid_mobile_auth_code");
    return row.user;
  }).then((user) => issueTokenPair(user, deviceId));
}

export async function rotateMobileRefreshToken(refreshToken: string, deviceId: string) {
  const now = new Date();
  const row = await prisma.mobileRefreshToken.findUnique({
    where: { tokenHash: hash(refreshToken) },
    include: { user: true }
  });
  if (!row || row.deviceId !== deviceId || row.expiresAt <= now || row.user.role !== "ADMIN") {
    throw new Error("invalid_refresh_token");
  }
  if (row.revokedAt) {
    await prisma.mobileRefreshToken.updateMany({
      where: { familyId: row.familyId, revokedAt: null },
      data: { revokedAt: now }
    });
    throw new Error("refresh_token_reuse");
  }
  const claimed = await prisma.mobileRefreshToken.updateMany({
    where: { id: row.id, revokedAt: null },
    data: { revokedAt: now, lastUsedAt: now }
  });
  if (claimed.count !== 1) throw new Error("refresh_token_reuse");
  return issueTokenPair(row.user, deviceId, row.familyId);
}

export async function revokeMobileDevice(userId: string, deviceId: string) {
  const now = new Date();
  await prisma.$transaction([
    prisma.mobileRefreshToken.updateMany({
      where: { userId, deviceId, revokedAt: null },
      data: { revokedAt: now }
    }),
    prisma.adminDevice.updateMany({
      where: { userId, deviceId },
      data: { revokedAt: now, fcmToken: null }
    })
  ]);
}

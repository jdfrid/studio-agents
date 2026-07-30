import type { FastifyRequest } from "fastify";
import { prisma } from "@studio/infra-prisma";

export function clientIp(request: FastifyRequest): string {
  const xf = request.headers["x-forwarded-for"];
  if (typeof xf === "string") {
    const first = xf.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  } else if (Array.isArray(xf) && xf[0]) {
    return xf[0].trim().slice(0, 64);
  }
  const realIp = request.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) return realIp.trim().slice(0, 64);
  return (request.ip || "unknown").slice(0, 64);
}

export function clientUserAgent(request: FastifyRequest): string | null {
  const ua = request.headers["user-agent"];
  if (typeof ua !== "string" || !ua.trim()) return null;
  return ua.slice(0, 512);
}

export async function recordUserLogin(userId: string, request: FastifyRequest): Promise<void> {
  const ipAddress = clientIp(request);
  const userAgent = clientUserAgent(request);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.userLoginEvent.create({
      data: { userId, ipAddress, userAgent }
    });
    await tx.user.update({
      where: { id: userId },
      data: { lastLoginIp: ipAddress, lastLoginAt: now }
    });
  });
}

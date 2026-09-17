import { prisma } from "@studio/infra-prisma";
import type { UserView } from "@studio/shared";
import { getCreateVideoEligibility, getPlatformSettingsSync } from "@studio/billing";
import { adminEmails } from "./jwt.js";

export interface GoogleProfile {
  googleId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}

export async function findOrCreateUser(profile: GoogleProfile): Promise<UserView> {
  const email = profile.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({
    where: { googleId: profile.googleId },
    include: { subscription: true }
  });
  if (existing) {
    const shouldBeAdmin = adminEmails().has(email);
    if (shouldBeAdmin && existing.role !== "ADMIN") {
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: { role: "ADMIN" },
        include: { subscription: true }
      });
      return toUserView(updated);
    }
    return toUserView(existing);
  }

  const byEmail = await prisma.user.findUnique({
    where: { email },
    include: { subscription: true }
  });
  if (byEmail) {
    const linked = await prisma.user.update({
      where: { id: byEmail.id },
      data: {
        googleId: profile.googleId,
        name: byEmail.name ?? profile.name,
        avatarUrl: byEmail.avatarUrl ?? profile.avatarUrl,
        role: adminEmails().has(email) ? "ADMIN" : byEmail.role
      },
      include: { subscription: true }
    });
    return toUserView(linked);
  }

  const isAdmin = adminEmails().has(email);
  const tenant = await prisma.tenant.create({
    data: {
      slug: `user_${Date.now()}`,
      name: profile.name ?? email
    }
  });

  const user = await prisma.user.create({
    data: {
      googleId: profile.googleId,
      email,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      role: isAdmin ? "ADMIN" : "USER",
      tenantId: tenant.id
    },
    include: { subscription: true }
  });

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { slug: `user_${user.id}` }
  });

  return toUserView(user);
}

export async function getUserByEmail(email: string): Promise<{
  id: string;
  email: string;
  passwordHash: string | null;
  googleId: string | null;
} | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, email: true, passwordHash: true, googleId: true }
  });
  return user;
}

export async function createEmailUser(email: string, passwordHash: string): Promise<UserView> {
  const normalized = email.trim().toLowerCase();
  const isAdmin = adminEmails().has(normalized);
  const tenant = await prisma.tenant.create({
    data: {
      slug: `user_${Date.now()}`,
      name: normalized
    }
  });
  const user = await prisma.user.create({
    data: {
      email: normalized,
      passwordHash,
      name: normalized.split("@")[0],
      role: isAdmin ? "ADMIN" : "USER",
      tenantId: tenant.id
    },
    include: { subscription: true }
  });
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { slug: `user_${user.id}` }
  });
  return toUserView(user);
}

export async function setUserPasswordHash(userId: string, passwordHash: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}

export async function getUserById(userId: string): Promise<UserView | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { subscription: true }
  });
  return user ? toUserView(user) : null;
}

function toUserView(user: {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: "USER" | "ADMIN";
  subscription: {
    planType: "PAYG" | "SUBSCRIPTION" | "STARTER" | "BUSINESS";
    status: string;
    creditsPerPeriod: number;
    currentPeriodEnd: Date;
  } | null;
}): UserView {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
    credits: 0,
    freeVideosRemaining: 0,
    canCreateVideo: false,
    billingConfigured: false,
    allowDurationOver30: false,
    subscription: user.subscription
      ? {
          planType: user.subscription.planType,
          status: user.subscription.status,
          creditsPerPeriod: user.subscription.creditsPerPeriod,
          currentPeriodEnd: user.subscription.currentPeriodEnd.toISOString()
        }
      : null
  };
}

export async function getUserViewWithCredits(userId: string): Promise<UserView | null> {
  const user = await getUserById(userId);
  if (!user) return null;
  const eligibility = await getCreateVideoEligibility(userId);
  return {
    ...user,
    credits: eligibility.credits,
    freeVideosRemaining: eligibility.freeVideosRemaining,
    canCreateVideo: eligibility.canCreateVideo,
    billingConfigured: eligibility.billingConfigured,
    allowDurationOver30: getPlatformSettingsSync().allowDurationOver30
  };
}

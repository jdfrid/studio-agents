import { prisma } from "@studio/infra-prisma";
import type { UserView } from "@studio/shared";
import { adminEmails } from "./jwt.js";

export interface GoogleProfile {
  googleId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}

export async function findOrCreateUser(profile: GoogleProfile): Promise<UserView> {
  const existing = await prisma.user.findUnique({
    where: { googleId: profile.googleId },
    include: { subscription: true }
  });
  if (existing) {
    return toUserView(existing);
  }

  const isAdmin = adminEmails().has(profile.email.toLowerCase());
  const tenant = await prisma.tenant.create({
    data: {
      slug: `user_${Date.now()}`,
      name: profile.name ?? profile.email
    }
  });

  const user = await prisma.user.create({
    data: {
      googleId: profile.googleId,
      email: profile.email,
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

export async function getUserById(userId: string): Promise<UserView | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { subscription: true }
  });
  return user ? toUserView(user) : null;
}

export async function getCreditBalance(userId: string): Promise<number> {
  const last = await prisma.creditLedger.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" }
  });
  return last?.balanceAfter ?? 0;
}

function toUserView(user: {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: "USER" | "ADMIN";
  locale: string;
  subscription: {
    planType: "PAYG" | "SUBSCRIPTION";
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
    locale: user.locale,
    credits: 0,
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
  user.credits = await getCreditBalance(userId);
  return user;
}

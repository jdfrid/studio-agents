import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@studio/infra-prisma";
import type { CheckoutPlanId } from "@studio/shared";
import { grantCredits } from "./credits.js";
import { amountNisFromMinor, grantForPlan, type PlanGrant } from "./plans.js";
import {
  setSubscriptionStatus,
  syncSubscriptionGrants,
  upsertSubscription,
  type SubscriptionState
} from "./subscriptions.js";

const PLAN_PRODUCT_ENV: Record<CheckoutPlanId, string> = {
  payg: "CREEM_PRODUCT_PAYG",
  starter: "CREEM_PRODUCT_MONTHLY",
  business: "CREEM_PRODUCT_YEARLY"
};

export function creemApiKey(): string | undefined {
  return process.env.CREEM_API_KEY?.trim() || undefined;
}

/** Test keys (creem_test_…) talk to the sandbox; live keys to production. */
export function creemApiBase(key = creemApiKey()): string {
  return key?.startsWith("creem_test_") ? "https://test-api.creem.io" : "https://api.creem.io";
}

export function creemProductId(plan: CheckoutPlanId): string | undefined {
  return process.env[PLAN_PRODUCT_ENV[plan]]?.trim() || undefined;
}

export function planForCreemProduct(productId: string | null | undefined): CheckoutPlanId | null {
  if (!productId) return null;
  for (const plan of Object.keys(PLAN_PRODUCT_ENV) as CheckoutPlanId[]) {
    if (creemProductId(plan) === productId) return plan;
  }
  return null;
}

export async function createCheckout(userId: string, email: string, plan: CheckoutPlanId): Promise<string> {
  const key = creemApiKey();
  const productId = creemProductId(plan);
  if (!key) throw new Error("CREEM_API_KEY not configured");
  if (!productId) throw new Error(`Creem product not configured for ${plan}`);
  const appUrl = (process.env.APP_URL ?? "http://localhost:5173").replace(/\/$/, "");
  const res = await fetch(`${creemApiBase(key)}/v1/checkouts`, {
    method: "POST",
    headers: { "x-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      product_id: productId,
      request_id: `${userId}:${plan}:${Date.now()}`,
      customer: { email },
      success_url: `${appUrl}/?payment=success`,
      metadata: { user_id: userId, plan }
    }),
    signal: AbortSignal.timeout(15_000)
  });
  if (!res.ok) throw new Error(`Creem checkout failed: ${res.status} ${(await res.text()).slice(0, 500)}`);
  const json = (await res.json()) as { checkout_url?: string };
  if (!json.checkout_url) throw new Error("Creem checkout returned no checkout_url");
  return json.checkout_url;
}

export function verifyCreemSignature(rawBody: string, signature: string | undefined): boolean {
  const secret = process.env.CREEM_WEBHOOK_SECRET?.trim();
  if (!secret || !signature) return false;
  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
  const given = Buffer.from(signature.trim(), "utf8");
  const expected = Buffer.from(digest, "utf8");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

type Obj = Record<string, unknown>;
const asObj = (value: unknown): Obj | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Obj) : undefined;
const idOf = (value: unknown): string | null =>
  typeof value === "string" ? value : typeof asObj(value)?.id === "string" ? (asObj(value)!.id as string) : null;
const dateOf = (value: unknown): Date | null => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

export function creemSubscriptionState(status: unknown): SubscriptionState {
  switch (String(status ?? "").toLowerCase()) {
    case "scheduled_cancel":
      // Still paid until current_period_end_date; monthly grants continue until then.
      return "CANCELLED";
    case "canceled":
    case "cancelled":
    case "expired":
      return "EXPIRED";
    case "past_due":
    case "unpaid":
    case "paused":
      return "PAST_DUE";
    default:
      return "ACTIVE";
  }
}

async function resolveUserId(object: Obj): Promise<string | null> {
  const candidates = [asObj(object.metadata), asObj(asObj(object.subscription)?.metadata)];
  for (const meta of candidates) {
    if (typeof meta?.user_id === "string" && meta.user_id) {
      const user = await prisma.user.findUnique({ where: { id: meta.user_id }, select: { id: true } });
      if (user) return user.id;
    }
  }
  const email = asObj(object.customer)?.email;
  if (typeof email === "string" && email) {
    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true } });
    return user?.id ?? null;
  }
  return null;
}

function grantForProduct(product: unknown): PlanGrant | null {
  const plan = planForCreemProduct(idOf(product));
  return plan ? grantForPlan(plan) : null;
}

async function handleSubscriptionEvent(eventType: string, userId: string, sub: Obj): Promise<void> {
  const subId = idOf(sub);
  if (!subId) return;
  const grant = grantForProduct(sub.product);
  const state = creemSubscriptionState(eventType === "subscription.paid" ? "active" : sub.status);
  const periodStart = dateOf(sub.current_period_start_date);
  const periodEnd = dateOf(sub.current_period_end_date);
  if (grant && grant.interval !== "once" && periodStart && periodEnd && periodEnd > periodStart) {
    await upsertSubscription({ userId, providerSubscriptionId: subId, grant, status: state, periodStart, periodEnd });
  } else {
    await setSubscriptionStatus(subId, state);
  }
  if (eventType === "subscription.paid") {
    const product = asObj(sub.product);
    const txId = typeof sub.last_transaction_id === "string" ? sub.last_transaction_id : null;
    const key = `creem-tx:${txId ?? `${subId}:${periodStart?.toISOString() ?? Date.now()}`}`;
    if (!(await prisma.payment.findUnique({ where: { lemonOrderId: key } }))) {
      await prisma.payment.create({
        data: {
          userId,
          lemonOrderId: key,
          amountNis: amountNisFromMinor(product?.price, product?.currency, grant?.checkoutPlan),
          planType: grant?.planType ?? "SUBSCRIPTION",
          creditsGranted: 0,
          status: "paid"
        }
      });
    }
  }
  await syncSubscriptionGrants(subId);
}

async function handleCheckoutCompleted(userId: string, checkout: Obj): Promise<void> {
  const order = asObj(checkout.order);
  const orderId = idOf(order);
  const grant = grantForProduct(checkout.product ?? order?.product);
  if (!orderId || !grant || grant.interval !== "once") return;
  const key = `creem:${orderId}`;
  if (await prisma.payment.findUnique({ where: { lemonOrderId: key } })) return;
  await prisma.payment.create({
    data: {
      userId,
      lemonOrderId: key,
      amountNis: amountNisFromMinor(order?.amount, order?.currency, grant.checkoutPlan),
      planType: grant.planType,
      creditsGranted: grant.credits,
      status: "paid"
    }
  });
  await grantCredits(userId, grant.credits, "PURCHASE", { creemOrderId: orderId, plan: grant.checkoutPlan });
}

async function handleRefund(userId: string, refund: Obj): Promise<void> {
  const tx = asObj(refund.transaction);
  const keys = [
    idOf(tx?.order) ? `creem:${idOf(tx?.order)}` : null,
    idOf(tx) ? `creem-tx:${idOf(tx)}` : null
  ].filter((k): k is string => Boolean(k));
  for (const key of keys) {
    const payment = await prisma.payment.findUnique({ where: { lemonOrderId: key } });
    if (!payment || payment.status === "refunded") continue;
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "refunded" } });
    if (payment.creditsGranted > 0) {
      await grantCredits(userId, -payment.creditsGranted, "REFUND", { paymentKey: key });
    }
  }
  const subId = idOf(tx?.subscription) ?? idOf(refund.subscription);
  if (subId) await setSubscriptionStatus(subId, "EXPIRED");
}

export async function handleCreemWebhook(event: { eventType?: unknown; object?: unknown }): Promise<void> {
  const eventType = String(event.eventType ?? "");
  const object = asObj(event.object);
  if (!object) return;
  const userId = await resolveUserId(object);
  if (!userId) return;
  if (eventType === "checkout.completed") return handleCheckoutCompleted(userId, object);
  if (eventType === "refund.created") return handleRefund(userId, object);
  if (eventType.startsWith("subscription.")) return handleSubscriptionEvent(eventType, userId, object);
}

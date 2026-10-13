import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@studio/infra-prisma";
import {
  BUSINESS_GRANT_MONTHS,
  CHECKOUT_PLANS,
  checkoutCurrencyFromLocale,
  type CheckoutCurrency,
  type CheckoutPlanId
} from "@studio/shared";
import { grantCredits } from "./credits.js";
import {
  addMonths,
  checkoutCopy,
  checkoutStoreId,
  checkoutVariantId,
  extractLemonVariantId,
  grantForLemonVariant,
  monthlyGrantsDue,
  monthsPerBillingPeriod,
  orderAmountNis,
  subscriptionStatusFromLemon
} from "./lemonPlans.js";

const LS_API = "https://api.lemonsqueezy.com/v1";

function lsHeaders(): Record<string, string> {
  const key = process.env.LEMONSQUEEZY_API_KEY;
  if (!key) throw new Error("LEMONSQUEEZY_API_KEY not configured");
  return {
    Authorization: `Bearer ${key}`,
    Accept: "application/vnd.api+json",
    "Content-Type": "application/vnd.api+json"
  };
}

export async function createCheckout(
  userId: string,
  email: string,
  plan: CheckoutPlanId,
  locale?: string | null
): Promise<string> {
  const currency: CheckoutCurrency = checkoutCurrencyFromLocale(locale);
  const storeId = checkoutStoreId(currency);
  const variantId = checkoutVariantId(plan, currency)?.trim();
  const appUrl = (process.env.APP_URL ?? "http://localhost:5173").replace(/\/$/, "");
  const copy = checkoutCopy(plan);

  if (!storeId) throw new Error(`Lemon Squeezy store not configured for ${currency}`);
  if (!variantId) throw new Error(`Lemon Squeezy variant not configured for ${plan} (${currency})`);

  const body = {
    data: {
      type: "checkouts",
      attributes: {
        // The catalog is the price source of truth; Lemon applies it to renewals too.
        ...(currency === "usd" ? { custom_price: Math.round(CHECKOUT_PLANS[plan].priceUsd * 100) } : {}),
        checkout_data: {
          email,
          custom: { user_id: userId }
        },
        checkout_options: {
          embed: false,
          media: false,
          logo: true,
          desc: true,
          discount: false,
          dark: false,
          subscription_preview: true,
          button_color: "#173D35"
        },
        product_options: {
          name: copy.name,
          description: copy.description,
          redirect_url: `${appUrl}/?payment=success`,
          receipt_button_text: "Back to Reelmino",
          receipt_thank_you_note: "Thank you. Your credits will appear in Reelmino shortly.",
          receipt_link_url: `${appUrl}/`
        }
      },
      relationships: {
        store: { data: { type: "stores", id: storeId } },
        variant: { data: { type: "variants", id: variantId } }
      }
    }
  };

  const res = await fetch(`${LS_API}/checkouts`, {
    method: "POST",
    headers: lsHeaders(),
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Lemon Squeezy checkout failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { data: { attributes: { url: string } } };
  return json.data.attributes.url;
}

export function verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function handleLemonWebhook(eventName: string, payload: Record<string, unknown>): Promise<void> {
  const data = payload.data as Record<string, unknown> | undefined;
  const attrs = (data?.attributes ?? {}) as Record<string, unknown>;
  const meta = (payload.meta ?? {}) as Record<string, unknown>;
  const custom = (meta.custom_data ?? attrs.custom_data ?? {}) as Record<string, unknown>;
  let userId = typeof custom.user_id === "string" ? custom.user_id : null;

  if (!userId && typeof attrs.user_email === "string") {
    const user = await prisma.user.findUnique({ where: { email: attrs.user_email as string } });
    userId = user?.id ?? null;
  }
  if (!userId) return;

  const variantId = extractLemonVariantId(payload);

  switch (eventName) {
    case "order_created": {
      const grant = grantForLemonVariant(variantId, "order");
      if (grant.interval !== "once") return;
      const orderId = String(data?.id ?? "");
      const exists = await prisma.payment.findUnique({ where: { lemonOrderId: orderId } });
      if (exists) return;
      await prisma.payment.create({
        data: {
          userId,
          lemonOrderId: orderId,
          amountNis: orderAmountNis(attrs, grant.checkoutPlan),
          planType: grant.planType,
          creditsGranted: grant.credits,
          status: "paid"
        }
      });
      await grantCredits(userId, grant.credits, "PURCHASE", { lemonOrderId: orderId, variantId });
      break;
    }
    case "order_refunded": {
      const orderId = String(data?.id ?? "");
      const payment = await prisma.payment.findUnique({ where: { lemonOrderId: orderId } });
      if (!payment || payment.status === "refunded") return;
      await prisma.payment.update({ where: { id: payment.id }, data: { status: "refunded" } });
      await grantCredits(userId, -payment.creditsGranted, "REFUND", { lemonOrderId: orderId });
      break;
    }
    case "subscription_created":
    case "subscription_updated":
    case "subscription_resumed":
    case "subscription_unpaused":
    case "subscription_plan_changed":
    case "subscription_cancelled":
    case "subscription_expired":
    case "subscription_paused":
    case "subscription_payment_failed": {
      if (data?.type !== "subscriptions") return;
      const subId = String(data.id ?? "");
      await upsertLemonSubscription(userId, subId, attrs, variantId);
      await syncSubscriptionGrants(subId);
      break;
    }
    case "subscription_payment_success":
    case "subscription_payment_recovered": {
      // Payload is a subscription invoice; the period dates live on the subscription itself.
      const subId = String(attrs.subscription_id ?? (data?.type === "subscriptions" ? data.id : "") ?? "");
      if (!subId) return;
      await recordSubscriptionInvoice(userId, data, attrs);
      const sub = await fetchLemonSubscription(subId);
      if (sub) {
        const subAttrs = sub.attributes;
        await upsertLemonSubscription(userId, subId, subAttrs, subAttrs.variant_id == null ? null : String(subAttrs.variant_id));
      }
      await syncSubscriptionGrants(subId);
      break;
    }
    default:
      break;
  }
}

async function fetchLemonSubscription(
  subId: string
): Promise<{ id: string; attributes: Record<string, unknown> } | null> {
  try {
    const res = await fetch(`${LS_API}/subscriptions/${encodeURIComponent(subId)}`, { headers: lsHeaders() });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { id: string; attributes: Record<string, unknown> } };
    return json.data ?? null;
  } catch {
    return null;
  }
}

async function upsertLemonSubscription(
  userId: string,
  subId: string,
  attrs: Record<string, unknown>,
  variantId: string | null
): Promise<void> {
  if (!subId) return;
  const grant = grantForLemonVariant(variantId, "subscription");
  const months = monthsPerBillingPeriod(grant.interval);
  const status = subscriptionStatusFromLemon(attrs.status);
  const endRaw = status === "CANCELLED" || status === "EXPIRED" ? (attrs.ends_at ?? attrs.renews_at) : attrs.renews_at;
  const periodEnd = endRaw ? new Date(String(endRaw)) : addMonths(new Date(), months);
  const periodStart = addMonths(periodEnd, -months);
  const data = {
    lemonSubscriptionId: subId,
    planType: grant.planType,
    status,
    creditsPerPeriod: grant.credits,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd
  };
  await prisma.subscription.upsert({ where: { userId }, create: { userId, ...data }, update: data });
}

async function recordSubscriptionInvoice(
  userId: string,
  data: Record<string, unknown> | undefined,
  attrs: Record<string, unknown>
): Promise<void> {
  if (data?.type !== "subscription-invoices" || !data.id) return;
  const key = `sub-invoice:${String(data.id)}`;
  if (await prisma.payment.findUnique({ where: { lemonOrderId: key } })) return;
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  await prisma.payment.create({
    data: {
      userId,
      lemonOrderId: key,
      amountNis: orderAmountNis(attrs),
      planType: sub?.planType ?? "SUBSCRIPTION",
      creditsGranted: 0,
      status: "paid"
    }
  });
}

/**
 * Grants the monthly credits owed for the current billing period of one subscription.
 * Idempotent: each (subscription, period start, month) is granted once, under an advisory lock.
 * Monthly plans get one grant per period; yearly plans get one grant per month of the paid year.
 */
export async function syncSubscriptionGrants(lemonSubscriptionId: string, now = new Date()): Promise<number> {
  const sub = await prisma.subscription.findUnique({ where: { lemonSubscriptionId } });
  if (!sub || sub.status === "EXPIRED" || sub.status === "PAST_DUE") return 0;
  const months = sub.planType === "BUSINESS" ? BUSINESS_GRANT_MONTHS : 1;
  const due = monthlyGrantsDue(sub.currentPeriodStart, sub.currentPeriodEnd, now, months);
  if (due <= 0) return 0;
  const periodStart = sub.currentPeriodStart.toISOString();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sub-grant:${lemonSubscriptionId}`}))`;
    const existing = await tx.creditLedger.findMany({
      where: {
        userId: sub.userId,
        reason: "SUBSCRIPTION_GRANT",
        AND: [
          { metadata: { path: ["lemonSubscriptionId"], equals: lemonSubscriptionId } },
          { metadata: { path: ["periodStart"], equals: periodStart } }
        ]
      },
      select: { metadata: true }
    });
    const grantedMonths = new Set(
      existing.map((row) => Number((row.metadata as { month?: unknown } | null)?.month ?? 0))
    );
    let granted = 0;
    for (let month = 1; month <= due; month += 1) {
      if (grantedMonths.has(month)) continue;
      const last = await tx.creditLedger.findFirst({ where: { userId: sub.userId }, orderBy: { createdAt: "desc" } });
      const balance = last?.balanceAfter ?? 0;
      await tx.creditLedger.create({
        data: {
          userId: sub.userId,
          delta: sub.creditsPerPeriod,
          reason: "SUBSCRIPTION_GRANT",
          balanceAfter: Math.round((balance + sub.creditsPerPeriod) * 1000) / 1000,
          metadata: { lemonSubscriptionId, periodStart, month, planType: sub.planType }
        }
      });
      granted += 1;
    }
    return granted;
  });
}

/** Hourly sweep so yearly subscribers receive each month's credits without a Lemon event. */
export async function syncAllSubscriptionGrants(now = new Date()): Promise<number> {
  const subs = await prisma.subscription.findMany({
    where: { status: { in: ["ACTIVE", "CANCELLED"] }, currentPeriodEnd: { gt: now } },
    select: { lemonSubscriptionId: true }
  });
  let total = 0;
  for (const sub of subs) total += await syncSubscriptionGrants(sub.lemonSubscriptionId, now);
  return total;
}

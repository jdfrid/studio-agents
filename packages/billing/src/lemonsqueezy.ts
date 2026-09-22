import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@studio/infra-prisma";
import {
  checkoutCurrencyFromLocale,
  type CheckoutCurrency,
  type CheckoutPlanId
} from "@studio/shared";
import { grantCredits } from "./credits.js";
import {
  checkoutCopy,
  checkoutStoreId,
  checkoutVariantId,
  extractLemonVariantId,
  grantForLemonVariant,
  orderAmountNis
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
      if (grant.interval === "month") return;
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
    case "subscription_payment_success": {
      const grant = grantForLemonVariant(variantId, "subscription");
      const subId = String(data?.id ?? "");
      const periodEnd = attrs.renews_at ? new Date(String(attrs.renews_at)) : new Date(Date.now() + 30 * 86400000);
      const periodStart = attrs.created_at ? new Date(String(attrs.created_at)) : new Date();
      await prisma.subscription.upsert({
        where: { userId },
        create: {
          userId,
          lemonSubscriptionId: subId,
          planType: grant.planType,
          status: "ACTIVE",
          creditsPerPeriod: grant.credits,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd
        },
        update: {
          lemonSubscriptionId: subId,
          status: "ACTIVE",
          planType: grant.planType,
          creditsPerPeriod: grant.credits,
          currentPeriodEnd: periodEnd
        }
      });
      if (eventName === "subscription_payment_success" || eventName === "subscription_created") {
        await grantCredits(userId, grant.credits, "SUBSCRIPTION_GRANT", {
          lemonSubscriptionId: subId,
          variantId
        });
      }
      break;
    }
    case "subscription_cancelled":
    case "subscription_expired": {
      await prisma.subscription.updateMany({
        where: { userId },
        data: { status: eventName === "subscription_cancelled" ? "CANCELLED" : "EXPIRED" }
      });
      break;
    }
    default:
      break;
  }
}

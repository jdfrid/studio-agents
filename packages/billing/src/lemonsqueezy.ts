import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@studio/infra-prisma";
import { grantCredits } from "./credits.js";

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

export async function createCheckout(userId: string, email: string, plan: "payg" | "subscription"): Promise<string> {
  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  const variantPayg = process.env.LEMONSQUEEZY_VARIANT_PAYG;
  const variantSub = process.env.LEMONSQUEEZY_VARIANT_SUBSCRIPTION;
  const appUrl = (process.env.APP_URL ?? "http://localhost:5173").replace(/\/$/, "");

  if (!storeId) throw new Error("LEMONSQUEEZY_STORE_ID not configured");
  const variantId = plan === "payg" ? variantPayg : variantSub;
  if (!variantId) throw new Error(`Lemon Squeezy variant not configured for ${plan}`);

  const body = {
    data: {
      type: "checkouts",
      attributes: {
        checkout_data: {
          email,
          custom: { user_id: userId }
        },
        product_options: {
          redirect_url: `${appUrl}/dashboard?payment=success`,
          receipt_button_text: "חזרה לאפליקציה",
          receipt_link_url: `${appUrl}/dashboard`
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

  switch (eventName) {
    case "order_created": {
      const orderId = String(data?.id ?? "");
      const total = Number(attrs.total ?? attrs.total_usd ?? 0) / 100;
      const exists = await prisma.payment.findUnique({ where: { lemonOrderId: orderId } });
      if (exists) return;
      await prisma.payment.create({
        data: {
          userId,
          lemonOrderId: orderId,
          amountNis: total > 0 ? total : 30,
          planType: "PAYG",
          creditsGranted: 1,
          status: "paid"
        }
      });
      await grantCredits(userId, 1, "PURCHASE", { lemonOrderId: orderId });
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
      const subId = String(data?.id ?? "");
      const periodEnd = attrs.renews_at ? new Date(String(attrs.renews_at)) : new Date(Date.now() + 30 * 86400000);
      const periodStart = attrs.created_at ? new Date(String(attrs.created_at)) : new Date();
      await prisma.subscription.upsert({
        where: { userId },
        create: {
          userId,
          lemonSubscriptionId: subId,
          planType: "SUBSCRIPTION",
          status: "ACTIVE",
          creditsPerPeriod: 30,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd
        },
        update: {
          lemonSubscriptionId: subId,
          status: "ACTIVE",
          currentPeriodEnd: periodEnd
        }
      });
      if (eventName === "subscription_payment_success" || eventName === "subscription_created") {
        await grantCredits(userId, 30, "SUBSCRIPTION_GRANT", { lemonSubscriptionId: subId });
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

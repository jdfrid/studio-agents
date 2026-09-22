import { useTranslation } from "react-i18next";
import {
  BUSINESS_CREDITS,
  BUSINESS_PRICE_NIS,
  CHECKOUT_PLANS,
  PAYG_CREDITS,
  PAYG_PRICE_NIS,
  STARTER_CREDITS,
  STARTER_PRICE_NIS,
  type CheckoutPlanId,
  type UserView
} from "@studio/shared";
import { canCheckoutPlan } from "./checkoutPlans.js";

const PLAN_ORDER: CheckoutPlanId[] = ["payg", "starter", "business"];

export function PricingCards({
  mode,
  busy,
  user,
  billingReady,
  signedIn,
  onSelect,
  onContact
}: {
  mode: "teaser" | "checkout";
  busy?: string | null;
  user?: UserView | null;
  billingReady?: boolean;
  signedIn?: boolean;
  onSelect: (plan: CheckoutPlanId) => void;
  onContact?: () => void;
}) {
  const { t } = useTranslation();
  const prices: Record<CheckoutPlanId, number> = {
    payg: PAYG_PRICE_NIS,
    starter: STARTER_PRICE_NIS,
    business: BUSINESS_PRICE_NIS
  };
  const credits: Record<CheckoutPlanId, number> = {
    payg: PAYG_CREDITS,
    starter: STARTER_CREDITS,
    business: BUSINESS_CREDITS
  };

  return (
    <>
      <div className="pricing-cards">
        {PLAN_ORDER.map((plan) => {
          const featured = plan === "business";
          const catalog = CHECKOUT_PLANS[plan];
          const planReady = user ? canCheckoutPlan(user, plan) : Boolean(billingReady);
          const checkoutDisabled =
            mode === "checkout" && Boolean(signedIn) && (Boolean(busy) || !planReady);
          return (
            <article key={plan} className={featured ? "price-card featured" : "price-card"}>
              {featured ? <span className="popular-badge">{t("landing.plans.popular")}</span> : null}
              <span className="price-kicker">{t(`landing.plans.${plan}.kicker`)}</span>
              <h3>{t(`landing.plans.${plan}.name`)}</h3>
              <p className="price">
                <strong>₪{prices[plan]}</strong>
                <small>{t(`landing.plans.${plan}.period`)}</small>
              </p>
              <p className="price-equiv">{t(`landing.plans.${plan}.credits`, { count: credits[plan] })}</p>
              <ul>
                <li>{t(`landing.plans.${plan}.videos`, { count: catalog.equivalentVideos })}</li>
                <li>{t(`landing.plans.${plan}.flow`)}</li>
                <li>{t(`landing.plans.${plan}.extra`)}</li>
              </ul>
              <button
                type="button"
                className={featured ? "primary" : undefined}
                disabled={checkoutDisabled}
                title={checkoutDisabled && signedIn && !planReady ? t("dashboard.planUnavailable") : undefined}
                onClick={() => onSelect(plan)}
              >
                {busy === plan ? t("dashboard.openingPayment") : t(`landing.plans.${plan}.cta`)}
              </button>
            </article>
          );
        })}
      </div>
      <p className="pricing-vat">{t("landing.plans.vat")}</p>
      {mode === "checkout" && onContact ? (
        <article className="price-card price-card-auto">
          <span className="price-kicker">{t("landing.plans.auto.kicker")}</span>
          <h3>{t("landing.plans.auto.name")}</h3>
          <p className="price-equiv">{t("landing.plans.auto.body")}</p>
          <button type="button" className="button-secondary" onClick={onContact}>
            {t("landing.plans.auto.cta")}
          </button>
        </article>
      ) : null}
    </>
  );
}

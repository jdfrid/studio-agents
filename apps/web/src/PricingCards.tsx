import { useTranslation } from "react-i18next";
import {
  CHECKOUT_PLANS,
  checkoutCurrencyFromLocale,
  formatCheckoutPrice,
  formatEffectivePerVideo,
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
  const { t, i18n } = useTranslation();
  const currency = checkoutCurrencyFromLocale(i18n.resolvedLanguage);

  return (
    <>
      <div className="pricing-cards">
        {PLAN_ORDER.map((plan) => {
          const featured = plan === "business";
          const catalog = CHECKOUT_PLANS[plan];
          const planReady = user ? canCheckoutPlan(user, plan, currency) : Boolean(billingReady);
          const checkoutDisabled =
            mode === "checkout" && Boolean(signedIn) && (Boolean(busy) || !planReady);
          const extra =
            plan === "payg"
              ? t(`landing.plans.${plan}.extra`)
              : t(`landing.plans.${plan}.extra`, { price: formatEffectivePerVideo(plan, currency) });
          return (
            <article key={plan} className={featured ? "price-card featured" : "price-card"}>
              {featured ? <span className="popular-badge">{t("landing.plans.popular")}</span> : null}
              <span className="price-kicker">{t(`landing.plans.${plan}.kicker`)}</span>
              <h3>{t(`landing.plans.${plan}.name`)}</h3>
              <p className="price">
                <strong>{formatCheckoutPrice(plan, currency)}</strong>
                <small>{t(`landing.plans.${plan}.period`)}</small>
              </p>
              <p className="price-equiv">{t(`landing.plans.${plan}.credits`, { count: catalog.credits })}</p>
              <ul>
                <li>{t(`landing.plans.${plan}.videos`, { count: catalog.equivalentVideos })}</li>
                <li>{t(`landing.plans.${plan}.flow`)}</li>
                <li>{extra}</li>
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

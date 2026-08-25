# Prompt2Spot — Measurement and experimentation specification

This specification is vendor-neutral. Implement the event contract in the product before buying acquisition media, then forward consented events to the selected analytics and advertising destinations.

## Measurement principles

1. Revenue and completed-video economics outrank clicks and signups.
2. Preserve first-touch and last-touch attribution.
3. Use backend-confirmed payment and completion events as the source of truth.
4. Never send prompts, scripts, uploaded filenames, email addresses or other user content to advertising platforms.
5. Obtain required consent before loading non-essential analytics/advertising tags.
6. Separate production, staging and local events.

## UTM taxonomy

All externally distributed links use:

```text
utm_source=<platform-or-partner>
utm_medium=<organic|paid_social|cpc|email|partner|outbound>
utm_campaign=<yyyymm>-<audience>-<market>-<objective>
utm_content=<creative-id>-<hook>-<format>-<variant>
utm_term=<search-keyword-or-audience>
```

### Allowed values

| Field | Examples |
|---|---|
| `utm_source` | `meta`, `google`, `linkedin`, `youtube`, `tiktok`, `instagram`, `newsletter`, `partner_northstar` |
| `utm_medium` | `organic`, `paid_social`, `cpc`, `email`, `partner`, `outbound` |
| Audience | `smb`, `agency`, `creator` |
| Market | `uk`, `au`, `us`, `il_en`, `il_he` |
| Objective | `demo`, `first_purchase`, `agency_demo`, `case_study` |
| Hook | `outcome`, `time`, `diy`, `control`, `cost`, `proof` |
| Format | `v9x16`, `v1x1`, `v16x9`, `carousel`, `text`, `email` |

### Example

```text
https://prompt2spot.com/for-business
?utm_source=instagram
&utm_medium=organic
&utm_campaign=202609-smb-uk-demo
&utm_content=ecw02a-outcome-v9x16-a
```

Creative IDs use `<vertical><week><asset>`, for example `ecw02a` = e-commerce, week 2, asset A.

## Attribution storage

On first eligible landing:

- Store first-touch UTM fields, referrer, landing path and timestamp.
- Store anonymous session ID.
- Store last non-direct touch separately on every new attributed visit.
- Persist attribution for 90 days or until the user clears storage/withdraws consent.
- On authentication, associate the anonymous journey with the internal user ID on the server.
- On purchase, copy first and last touch into an immutable order-attribution record.

Do not overwrite first touch with direct traffic.

---

## Product event contract

Common properties on every event:

```ts
type CommonMarketingEvent = {
  eventId: string;
  occurredAt: string;
  environment: "production" | "staging" | "development";
  anonymousId?: string;
  userId?: string;
  sessionId: string;
  pagePath?: string;
  market?: string;
  language?: string;
  audience?: "smb" | "agency" | "creator" | "unknown";
  firstTouch?: Attribution;
  lastTouch?: Attribution;
};
```

Advertising destinations receive only an allowlisted subset. Internal analytics may receive product IDs and run IDs, but never user-generated content.

### Funnel events

| Event | Trigger | Required properties | Source of truth |
|---|---|---|---|
| `landing_viewed` | Qualified page view | `landingVariant`, `audience` | Browser |
| `demo_started` | User plays a demo | `demoId`, `placement` | Browser |
| `demo_progressed` | 25%, 50%, 75%, 100% | `demoId`, `percent` | Browser |
| `pricing_viewed` | Pricing section/page visible | `offerId`, `audience` | Browser |
| `signup_started` | Auth/signup opened | `entryPoint` | Browser |
| `signup_completed` | Account created | `authMethod` | Backend/auth callback |
| `creation_started` | User submits a valid brief | `runId`, `preset`, `renderProfile`, `plannedSeconds` | Backend |
| `checkout_started` | Checkout session created | `checkoutId`, `offerId`, `currency`, `value` | Backend |
| `purchase_completed` | Payment confirmed | `orderId`, `offerId`, `currency`, `grossValue`, `netValue`, `isFirstPurchase` | Payment webhook |
| `video_completed` | Final deliverable becomes available | `runId`, `renderProfile`, `outputSeconds`, `workDurationMs`, `productionCostUsd` | Backend/orchestrator |
| `video_failed` | Run terminally fails | `runId`, `stage`, `errorCategory`, `recoverable` | Backend/orchestrator |
| `repeat_purchase_completed` | Confirmed purchase after first | `orderId`, `daysSinceFirstPurchase` | Payment webhook |
| `subscription_started` | Subscription activation confirmed | `subscriptionId`, `planId`, `mrr`, `currency` | Payment webhook |
| `subscription_cancelled` | Subscription cancelled/expired | `subscriptionId`, `planId`, `reasonCategory`, `activeDays` | Payment webhook |
| `agency_demo_requested` | Valid booking/lead submitted | `companySize`, `monthlyVideoBand`, `market` | Backend/CRM |
| `agency_pilot_started` | Paid pilot confirmed | `agencyId`, `pilotId`, `plannedVideos` | Backend/CRM |

### Event idempotency

- Generate a stable `eventId`.
- Payment events use payment-provider event/order IDs.
- Backend consumers reject duplicate `eventId`.
- Client retries keep the same ID when retrying delivery.

## Advertising conversion mapping

Send only consented, minimum-necessary conversions:

| Internal event | Google Ads | Meta |
|---|---|---|
| `signup_completed` | Secondary conversion | Custom conversion |
| `creation_started` | Secondary conversion | Custom conversion |
| `checkout_started` | Secondary conversion | InitiateCheckout |
| `purchase_completed` | Primary conversion with value | Purchase with value |
| `agency_demo_requested` | Primary lead conversion | Lead |

Optimize paid campaigns to `purchase_completed` or `agency_demo_requested` once volume is sufficient. Until then, use `creation_started` as a temporary optimization signal while reporting purchases separately.

---

## Dashboard specification

### Page 1 — Executive scorecard

- Spend
- New paying customers
- First-purchase revenue
- Subscription MRR
- Blended CAC
- First-purchase CAC
- 30-day repeat-purchase rate
- Purchase → subscription conversion
- Gross contribution
- CAC payback months

### Page 2 — Acquisition funnel

Break down by week, market, audience, source, campaign, hook and landing variant:

`landing_viewed → signup_completed → creation_started → video_completed → checkout_started → purchase_completed`

Show count, step conversion and median time between steps.

### Page 3 — Creative

- Spend and impressions
- 3-second hold
- 25%/50%/100% video rate
- CTR
- Landing conversion
- Started creations
- Completed videos
- Purchases
- Cost per purchase
- Gross contribution by creative ID

### Page 4 — Product activation and quality

- Signup → creation start
- Creation start → video complete
- Median work duration
- Failure rate by stage/provider/profile
- Production cost per completed video
- Revision/refund rate
- Repeat purchase by first render profile

### Page 5 — Agency and partners

- Contacts → replies → demos → paid pilots → active agency
- Partner clicks → starts → purchases
- Net revenue, refunds and commission by partner
- Partner-sourced CAC and contribution

## KPI definitions

```text
Landing CVR = signup_completed / unique landing visitors
Creation activation = creation_started / signup_completed
Completion activation = video_completed / signup_completed
First-purchase CVR = first purchase / unique landing visitors
First-purchase CAC = acquisition spend / first-time purchasers
Blended CAC = total sales + marketing spend / new paying customers
Repeat-purchase rate (30d) = first purchasers with another purchase within 30d / eligible first purchasers
Purchase-to-subscription = customers starting subscription within 30d / eligible first purchasers
Gross contribution = net revenue - payment fees - refunds - variable production cost - partner commission
CAC payback months = CAC / monthly gross contribution per acquired customer
Agency pilot conversion = paid pilots / qualified demos
```

Use customer cohorts, not calendar-period ratios, for repeat purchase, churn and payback.

---

## Decision gates

### End of days 1–30

Required to advance:

- 1,000 qualified landing visits.
- Social CTR >1.5% on at least one reproducible creative.
- At least 10 purchases or qualified agency leads.
- One audience × hook combination wins on a downstream metric, not views alone.

If traffic is insufficient, extend the phase. If traffic is sufficient but activation is weak, fix landing/product onboarding before adding spend.

### End of days 31–60

Required to scale:

- First-purchase CAC ≤₪100.
- 30-day repeat purchase ≥25% among eligible customers.
- At least three subscriptions.
- At least two active agency/partner pilots.

Do not declare repeat purchase before the cohort has had 30 days to repeat.

### End of days 61–90

Expansion target:

- MRR ≥₪12,000.
- CAC payback ≤3 months.
- At least 20 paying customers.
- At least five qualified agencies in pipeline.

These are targets, not forecasts. Report sample size and confidence beside every gate.

## Experiment registry

Track every test with:

| Field | Description |
|---|---|
| Experiment ID | `exp-yyyymm-###` |
| Hypothesis | Expected behavior and why |
| Primary metric | One decision metric |
| Guardrail | Metric that must not degrade |
| Audience/market | One defined segment |
| Changed variable | Hook, offer, CTA, page or audience — one only |
| Start/end | Fixed dates |
| Minimum sample | Defined before launch |
| Result | Win, loss, inconclusive |
| Decision | Stop, repair, continue, scale |

### Example

```text
ID: exp-202609-001
Hypothesis: Outcome-first creative will produce more completed creations than workflow-first creative for UK SMB traffic.
Primary: creation_started / unique landing visitor
Guardrail: purchase_completed / creation_started
Changed variable: opening hook
Minimum: 500 landing visitors per arm
```

## Pre-launch analytics QA

1. Verify consent behavior by region.
2. Confirm UTMs persist through signup and checkout.
3. Confirm direct revisits do not overwrite first touch.
4. Confirm payment webhooks deduplicate purchases.
5. Confirm test/staging transactions are excluded.
6. Confirm purchase value and currency match the payment provider.
7. Confirm no prompt, script, email or uploaded-asset data reaches ad tools.
8. Confirm ad-platform totals reconcile directionally with internal analytics.
9. Test mobile Safari, Chrome and blocked-cookie behavior.
10. Document data retention, deletion and access controls.


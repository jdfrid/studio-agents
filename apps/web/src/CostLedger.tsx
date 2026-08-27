import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {

  activityTypeLabel,

  formatCostNis,

  pricingSourceLabel,

  videoSecondsUnitLabel,

  type CostActivityType,

  type CostEventSummary,

  type CostEventView,

  type CostPricingSource,

  type RenderProfileId

} from "@studio/shared";




export interface CostLedgerResponse {

  events: CostEventView[];

  summary: CostEventSummary;

}



function formatDuration(ms: number | null | undefined): string {

  if (ms == null) return "—";

  if (ms < 1000) return `${ms}ms`;

  const seconds = ms / 1000;

  if (seconds < 60) return `${seconds.toFixed(1)}s`;

  const minutes = Math.floor(seconds / 60);

  const rest = Math.round(seconds % 60);

  return `${minutes}m ${rest}s`;

}



function readPricingSource(event: CostEventView): CostPricingSource | undefined {

  const fromMeta = event.metadata?.pricingSource;

  if (fromMeta === "usage_metadata" || fromMeta === "estimate" || fromMeta === "request_params") {

    return fromMeta;

  }

  return undefined;

}



function readTokenCounts(event: CostEventView): { input?: number; output?: number } {

  const input = event.metadata?.inputTokens ?? event.metadata?.input_tokens;

  const output = event.metadata?.outputTokens ?? event.metadata?.output_tokens;

  return {

    input: typeof input === "number" ? input : undefined,

    output: typeof output === "number" ? output : undefined

  };

}



function formatUnits(event: CostEventView, t: TFunction<"run">, locale: "he" | "en", renderProfileId?: RenderProfileId | null): string {

  switch (event.unit) {

    case "veo_seconds":

      return t("costs.units.videoSeconds", { count: event.billedUnits, unit: videoSecondsUnitLabel(renderProfileId ?? "veo-multiclip", locale) });

    case "tokens":

      return t("costs.units.tokens", { count: Math.round(event.billedUnits).toLocaleString(locale === "he" ? "he-IL" : "en-US") });

    case "image_call":

      return t("costs.units.image");

    case "text_call":

      return t("costs.units.text");

    case "tts_call":

      return t("costs.units.characters", { count: Math.round(event.billedUnits) });

    case "music_seconds":

      return t("costs.units.music", { count: event.billedUnits });

    case "bytes": {

      const mb = event.billedUnits / (1024 * 1024);

      return mb >= 1 ? `${mb.toFixed(2)} MB` : `${Math.round(event.billedUnits / 1024)} KB`;

    }

    default:

      return String(event.billedUnits);

  }

}



function summaryRows(summary: CostEventSummary, locale: "he" | "en", renderProfileId?: RenderProfileId | null): Array<{ label: string; nis: number; count: number }> {

  const order: CostActivityType[] = [

    "veo_video",

    "gemini_image",

    "gemini_tts",

    "gemini_text",

    "gemini_music",

    "gcs_upload",

    "gcs_storage"

  ];

  return order

    .map((type) => {

      const row = summary.byActivity[type];

      if (!row || row.count === 0) return null;

      return { label: activityTypeLabel(type, renderProfileId, locale), nis: row.nis, count: row.count };

    })

    .filter((row): row is { label: string; nis: number; count: number } => row != null);

}



export function CostLedger({
  ledger,
  renderProfileId
}: {
  ledger: CostLedgerResponse | null;
  renderProfileId?: RenderProfileId | null;
}) {
  const { t, i18n } = useTranslation("run");
  const locale = i18n.resolvedLanguage?.startsWith("en") ? "en" : "he";

  if (!ledger || ledger.events.length === 0) {

    return (

      <section className="cost-ledger cost-ledger-empty">

        <h3>{t("costs.title")}</h3>

        <p className="muted">{t("costs.empty")}</p>

      </section>

    );

  }



  const { events, summary } = ledger;

  const breakdown = summaryRows(summary, locale, renderProfileId);
  const videoUnit = videoSecondsUnitLabel(renderProfileId ?? "veo-multiclip", locale);

  const measuredCount = events.filter((e) => readPricingSource(e) === "usage_metadata").length;

  const estimateCount = events.filter((e) => readPricingSource(e) === "estimate").length;



  return (

    <section className="cost-ledger">

      <header className="cost-ledger-head">

        <h3>{t("costs.detailedTitle")}</h3>

        <p className="cost-ledger-total">

          {t("costs.total")}: <strong>{formatCostNis(summary.totalNis)}</strong>

          <span className="muted"> · ${summary.totalUsd.toFixed(2)}</span>

        </p>

      </header>

      <p className="cost-ledger-note muted">

        {measuredCount > 0 ? t("costs.measuredRows", { count: measuredCount }) : null}

        {measuredCount > 0 && estimateCount > 0 ? " · " : null}

        {estimateCount > 0 ? t("costs.estimatedRows", { count: estimateCount }) : null}

        {measuredCount === 0 && estimateCount === 0 ? t("costs.requestParams", { unit: videoUnit }) : null}

        {" "}{t("costs.freeRows")}

      </p>

      {breakdown.length > 0 ? (

        <ul className="cost-ledger-summary">

          {breakdown.map((row) => (

            <li key={row.label}>

              <strong>{row.label}:</strong> {formatCostNis(row.nis)} ({row.count})

            </li>

          ))}

        </ul>

      ) : null}

      <div className="cost-ledger-table-wrap">

        <table className="cost-ledger-table">

          <thead>

            <tr>

              <th>{t("costs.columns.date")}</th>

              <th>{t("costs.columns.stage")}</th>

              <th>{t("costs.columns.attempt")}</th>

              <th>{t("costs.columns.activity")}</th>

              <th>{t("costs.columns.model")}</th>

              <th>{t("costs.columns.source")}</th>

              <th>{t("costs.columns.tokens")}</th>

              <th title={t("costs.columns.renderTimeTitle")}>{t("costs.columns.renderTime")}</th>

              <th>{t("costs.columns.units")}</th>

              <th>₪</th>

            </tr>

          </thead>

          <tbody>

            {events.map((event) => {

              const source = readPricingSource(event);

              const tokens = readTokenCounts(event);

              return (

                <tr key={event.id} className={event.charged === "no" ? "cost-row-free" : undefined}>

                  <td>{new Date(event.startedAt).toLocaleString()}</td>

                  <td>{t(`stages.${event.stage}`, { defaultValue: event.stage })}</td>

                  <td>

                    {event.attempt && event.attempt > 1 ? (

                      <span className="badge badge-queued">#{event.attempt}</span>

                    ) : (

                      event.attempt ?? 1

                    )}

                  </td>

                  <td>

                    {activityTypeLabel(event.activityType, renderProfileId, locale)}

                    {event.sceneId ? (

                      <>

                        <br />

                        <small className="muted">{event.sceneId}</small>

                      </>

                    ) : null}

                  </td>

                  <td>

                    <code>{event.model ?? "—"}</code>

                  </td>

                  <td>

                    <span className={`cost-source cost-source-${source ?? "unknown"}`}>

                      {pricingSourceLabel(source, locale)}

                    </span>

                  </td>

                  <td>

                    {tokens.input != null || tokens.output != null ? (

                      <small>

                        in: {tokens.input?.toLocaleString() ?? "—"}

                        <br />

                        out: {tokens.output?.toLocaleString() ?? "—"}

                      </small>

                    ) : (

                      "—"

                    )}

                  </td>

                  <td>
                    {event.activityType === "veo_video" || event.stage === "render"
                      ? formatDuration(event.durationMs)
                      : "—"}
                  </td>

                  <td>{formatUnits(event, t, locale, renderProfileId)}</td>

                  <td>

                    <strong>{formatCostNis(event.costNis)}</strong>

                    {event.charged === "no" ? <small className="muted"> ({t("costs.notCharged")})</small> : null}

                  </td>

                </tr>

              );

            })}

          </tbody>

        </table>

      </div>

    </section>

  );

}



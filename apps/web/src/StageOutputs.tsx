import { useEffect, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { apiGet } from "./api.js";
import type { ArtifactRow, StageName } from "./types.js";
import { formatApiErrorMessage, type RenderProfileId } from "@studio/shared";

const STAGE_LABELS: Record<StageName, string> = {
  brief: "בריף",
  script: "תסריט",
  audio: "אודיו",
  asset: "ויזואל",
  package: "אריזה",
  render: "רינדור",
  series: "סדרה"
};

export { STAGE_LABELS };

type OpenArtifact = (artifactId: string) => Promise<void>;

export function StageOutputView({
  stage,
  output,
  artifacts,
  onOpenArtifact,
  renderProfileId
}: {
  stage: StageName;
  output: unknown;
  artifacts: ArtifactRow[];
  onOpenArtifact: OpenArtifact;
  renderProfileId?: RenderProfileId | null;
}) {
  if (!output || typeof output !== "object") return null;
  const data = output as Record<string, unknown>;

  switch (stage) {
    case "brief":
      return <BriefOutputView data={data} />;
    case "script":
      return <ScriptOutputView data={data} renderProfileId={renderProfileId} />;
    case "audio":
      return <AudioOutputView data={data} artifacts={artifacts} onOpenArtifact={onOpenArtifact} />;
    case "asset":
      return <AssetOutputView data={data} onOpenArtifact={onOpenArtifact} />;
    case "package":
      return <PackageOutputView data={data} onOpenArtifact={onOpenArtifact} />;
    case "render":
      return <RenderOutputView data={data} artifacts={artifacts} onOpenArtifact={onOpenArtifact} />;
    case "series":
      return <SeriesOutputView data={data} onOpenArtifact={onOpenArtifact} />;
    default:
      return null;
  }
}

function languageCode(code: unknown): string {
  const c = String(code ?? "").toLowerCase();
  for (const language of ["he", "en", "fr", "ar", "ru", "es", "yi"]) {
    if (c.startsWith(language)) return language;
  }
  return c || "—";
}

function BriefOutputView({ data }: { data: Record<string, unknown> }) {
  const { t } = useTranslation("run");
  return (
    <div className="stage-output">
      <Field label={t("outputs.fields.title")} value={data.title} />
      <Field label={t("outputs.fields.summary")} value={data.summary} />
      <Field label={t("outputs.fields.targetAudience")} value={data.targetAudience} />
      <Field label={t("outputs.fields.tone")} value={data.toneOfVoice} />
      <Field label={t("outputs.fields.style")} value={data.style} />
      <Field label={t("outputs.fields.visualDirection")} value={data.visualDirection} />
      <Field label={t("outputs.fields.musicDirection")} value={data.musicDirection} />
      {data.callToAction ? <Field label={t("outputs.fields.callToAction")} value={data.callToAction} /> : null}
      <small className="muted">
        {t("outputs.durationRatioLanguage", {
          duration: String(data.durationSeconds ?? "?"),
          ratio: String(data.aspectRatio ?? "?"),
          language: t(`outputs.languages.${languageCode(data.language)}`, { defaultValue: languageCode(data.language) })
        })}
      </small>
    </div>
  );
}

function ScriptOutputView({ data, renderProfileId }: { data: Record<string, unknown>; renderProfileId?: RenderProfileId | null }) {
  const { t } = useTranslation("run");
  const scenes = Array.isArray(data.scenes) ? (data.scenes as Array<Record<string, unknown>>) : [];
  const promptLabel = renderProfileId ? t("outputs.motionPrompt", { provider: renderProfileId }) : t("outputs.videoPrompt");
  return (
    <div className="stage-output">
      <Field label={t("outputs.fields.backgroundVisual")} value={data.backgroundVisualPrompt} />
      <Field label={t("outputs.fields.characterBible")} value={data.characterBible} />
      {data.visualCorrections ? <Field label={t("outputs.fields.visualCorrections")} value={data.visualCorrections} /> : null}
      <Field label={t("outputs.fields.musicPrompt")} value={data.musicPrompt} />
      <div className="scene-list">
        {scenes.map((scene) => (
          <article className="scene-mini" key={String(scene.id)}>
            <strong>
              {t("common.scene", { number: (Number(scene.order) ?? 0) + 1 })}: {String(scene.title ?? "")}
            </strong>
            <p>{String(scene.narration ?? "")}</p>
            <details className="tech-prompt">
              <summary className="muted">{t("outputs.technical", { label: promptLabel })}</summary>
              <small className="muted">{String(scene.veoPrompt ?? "—")}</small>
              {scene.referenceImagePrompt ? (
                <small className="muted">
                  {t("outputs.anchorImage")}:{" "}
                  {String(scene.referenceImagePrompt).length > 200
                    ? `${String(scene.referenceImagePrompt).slice(0, 200)}…`
                    : String(scene.referenceImagePrompt)}
                </small>
              ) : null}
            </details>
          </article>
        ))}
      </div>
    </div>
  );
}

function AudioOutputView({
  data,
  artifacts,
  onOpenArtifact
}: {
  data: Record<string, unknown>;
  artifacts: ArtifactRow[];
  onOpenArtifact: OpenArtifact;
}) {
  const { t, i18n } = useTranslation("run");
  const perScene = Array.isArray(data.perScene) ? (data.perScene as Array<Record<string, unknown>>) : [];
  const music = (data.music ?? {}) as Record<string, unknown>;
  const musicArtifact = artifacts.find((a) => a.kind === "music_track");
  return (
    <div className="stage-output">
      {perScene.map((row, index) => {
        const artifact = artifacts.find((a) => a.id === row.voiceArtifactId);
        return (
          <article className="scene-mini" key={String(row.sceneId)}>
            <strong>{t("outputs.voiceScene", { number: index + 1 })}</strong>
            {artifact ? (
              <ArtifactPlayer artifact={artifact} onOpenArtifact={onOpenArtifact} />
            ) : row.voiceError ? (
              <small className="error-inline">{localizeProviderError(String(row.voiceError), t, i18n.resolvedLanguage?.startsWith("en") ? "en" : "he")}</small>
            ) : (
              <small className="muted">{t("outputs.noVoice")}</small>
            )}
          </article>
        );
      })}
      <article className="scene-mini">
        <strong>{t("outputs.music")}</strong>
        {music.unavailableReason ? (
          <p className="warn-inline">{t("outputs.musicUnavailable", { reason: String(music.unavailableReason) })}</p>
        ) : musicArtifact ? (
          <ArtifactPlayer artifact={musicArtifact} onOpenArtifact={onOpenArtifact} />
        ) : (
          <small className="muted">{music.artifactId ? t("outputs.musicCreated") : t("outputs.noMusic")}</small>
        )}
      </article>
    </div>
  );
}

function AssetOutputView({
  data,
  onOpenArtifact
}: {
  data: Record<string, unknown>;
  onOpenArtifact: OpenArtifact;
}) {
  const { t } = useTranslation("run");
  const perScene = Array.isArray(data.perScene) ? (data.perScene as Array<Record<string, unknown>>) : [];
  return (
    <div className="stage-output asset-grid asset-grid-stack">
      {perScene.map((row, index) => (
        <article className="scene-mini" key={String(row.sceneId)}>
          <strong>{t("common.scene", { number: index + 1 })}</strong>
          <FramePreview label={t("outputs.frames.referenceFrame")} frame={row.referenceFrame} onOpenArtifact={onOpenArtifact} />
          <FramePreview label={t("outputs.frames.firstFrame")} frame={row.firstFrame} onOpenArtifact={onOpenArtifact} />
          <FramePreview label={t("outputs.frames.lastFrame")} frame={row.lastFrame} onOpenArtifact={onOpenArtifact} />
        </article>
      ))}
    </div>
  );
}

function PackageOutputView({
  data,
  onOpenArtifact
}: {
  data: Record<string, unknown>;
  onOpenArtifact: OpenArtifact;
}) {
  const { t } = useTranslation("run");
  const timeline = Array.isArray(data.timeline) ? (data.timeline as Array<Record<string, unknown>>) : [];
  return (
    <div className="stage-output">
      {typeof data.manifestSignedUrl === "string" ? (
        <MediaLink label={t("outputs.manifest")} url={data.manifestSignedUrl} />
      ) : null}
      {typeof data.instructionsGcsPath === "string" ? (
        <small className="muted">{t("outputs.instructions", { path: String(data.instructionsGcsPath) })}</small>
      ) : null}
      <table className="timeline-table">
        <thead>
          <tr>
            <th>#</th>
            <th>{t("outputs.tableTitle")}</th>
            <th>{t("outputs.tableTime")}</th>
          </tr>
        </thead>
        <tbody>
          {timeline.map((row) => (
            <tr key={String(row.sceneId)}>
              <td>{Number(row.order) + 1}</td>
              <td>{String(row.title ?? "")}</td>
              <td>
                {t("outputs.secondsShort", { start: Number(row.startSecond), end: Number(row.endSecond) })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {timeline.slice(0, 3).map((row) => {
        const voice = row.voice as Record<string, unknown> | undefined;
        const url = voice?.signedUrl;
        return typeof url === "string" ? (
          <SignedMedia key={`voice-${String(row.sceneId)}`} label={t("outputs.voiceTitle", { title: String(row.title) })} url={url} mimeType="audio/mpeg" />
        ) : null;
      })}
      {typeof data.instructionsArtifactId === "string" ? (
        <button type="button" onClick={() => void onOpenArtifact(data.instructionsArtifactId as string)}>
          {t("outputs.openInstructions")}
        </button>
      ) : null}
    </div>
  );
}

function RenderOutputView({
  data,
  artifacts,
  onOpenArtifact
}: {
  data: Record<string, unknown>;
  artifacts: ArtifactRow[];
  onOpenArtifact: OpenArtifact;
}) {
  const { t } = useTranslation("run");
  const finalUrl = typeof data.finalSignedUrl === "string" ? data.finalSignedUrl : null;
  const clipArtifacts = artifacts.filter((a) => a.kind === "scene_rendered_clip" || a.kind === "final_video");
  return (
    <div className="stage-output">
      {finalUrl ? <SignedMedia label={t("outputs.finalVideo")} url={finalUrl} mimeType="video/mp4" /> : null}
      {clipArtifacts.map((a) => (
        <ArtifactPlayer key={a.id} artifact={a} onOpenArtifact={onOpenArtifact} />
      ))}
    </div>
  );
}

function SeriesOutputView({
  data,
  onOpenArtifact
}: {
  data: Record<string, unknown>;
  onOpenArtifact: OpenArtifact;
}) {
  const { t } = useTranslation("run");
  const url = typeof data.finalSignedUrl === "string" ? data.finalSignedUrl : null;
  return (
    <div className="stage-output">
      {url ? (
        <SignedMedia label={data.passthrough ? t("outputs.finalFromRender") : t("outputs.seriesVideo")} url={url} mimeType="video/mp4" />
      ) : null}
      {data.finalArtifactId ? (
        <button type="button" onClick={() => void onOpenArtifact(String(data.finalArtifactId))}>
          {t("outputs.openFinal")}
        </button>
      ) : null}
    </div>
  );
}

function localizeProviderError(message: string, t: TFunction<"run">, locale: "he" | "en"): string {
  if (/שיבוט קול לא מוגדר|ELEVENLABS/i.test(message)) {
    return t("outputs.errors.voiceClone");
  }
  if (/no audio inline data|finishReason=OTHER/i.test(message)) {
    return formatApiErrorMessage(message, locale);
  }
  if (/enqueue_failed|locked by another worker/i.test(message)) {
    return t("outputs.errors.locked");
  }
  if (/Path .* not found|HTTP 404/i.test(message)) {
    return t("outputs.errors.modelMissing");
  }
  return formatApiErrorMessage(message, locale);
}

function Field({ label, value }: { label: string; value: unknown }) {
  if (value == null || value === "") return null;
  return (
    <p className="output-field">
      <b>{label}:</b> {String(value)}
    </p>
  );
}

function FramePreview({
  label,
  frame,
  onOpenArtifact
}: {
  label: string;
  frame: unknown;
  onOpenArtifact: OpenArtifact;
}) {
  if (!frame || typeof frame !== "object") return null;
  const f = frame as Record<string, unknown>;
  const staleUrl = typeof f.signedUrl === "string" ? f.signedUrl : null;
  const artifactId = typeof f.artifactId === "string" ? f.artifactId : null;
  if (artifactId) {
    return (
      <FreshSignedMedia
        label={label}
        artifactId={artifactId}
        fallbackUrl={staleUrl}
        mimeType="image/png"
        onOpenArtifact={onOpenArtifact}
      />
    );
  }
  if (staleUrl) return <SignedMedia label={label} url={staleUrl} mimeType="image/png" />;
  return null;
}

function FreshSignedMedia({
  label,
  artifactId,
  fallbackUrl,
  mimeType,
  onOpenArtifact
}: {
  label: string;
  artifactId: string;
  fallbackUrl: string | null;
  mimeType: string;
  onOpenArtifact: OpenArtifact;
}) {
  const [url, setUrl] = useState<string | null>(fallbackUrl);
  useEffect(() => {
    let active = true;
    void apiGet<{ url: string }>(`/artifacts/${artifactId}/signed-url`)
      .then((res) => {
        if (active) setUrl(res.url);
      })
      .catch(() => {
        /* keep fallback */
      });
    return () => {
      active = false;
    };
  }, [artifactId]);

  if (!url) {
    return (
      <button type="button" className="link-btn" onClick={() => void onOpenArtifact(artifactId)}>
        {label}
      </button>
    );
  }
  return (
    <SignedMedia
      label={label}
      url={url}
      mimeType={mimeType}
      onError={() => {
        void apiGet<{ url: string }>(`/artifacts/${artifactId}/signed-url`)
          .then((res) => setUrl(res.url))
          .catch(() => setUrl(null));
      }}
    />
  );
}

function SignedMedia({
  label,
  url,
  mimeType,
  onError
}: {
  label: string;
  url: string;
  mimeType: string;
  onError?: () => void;
}) {
  if (mimeType.startsWith("video/")) {
    return (
      <figure className="media-preview">
        <figcaption>{label}</figcaption>
        <video controls src={url} onError={onError} />
      </figure>
    );
  }
  if (mimeType.startsWith("audio/")) {
    return (
      <figure className="media-preview">
        <figcaption>{label}</figcaption>
        <audio controls src={url} onError={onError} />
      </figure>
    );
  }
  return (
    <figure className="media-preview">
      <figcaption>{label}</figcaption>
      <img src={url} alt={label} loading="lazy" onError={onError} />
    </figure>
  );
}

function MediaLink({ label, url }: { label: string; url: string }) {
  return (
    <p>
      <a href={url} target="_blank" rel="noreferrer">
        {label}
      </a>
    </p>
  );
}

function ArtifactPlayer({
  artifact,
  onOpenArtifact
}: {
  artifact: ArtifactRow;
  onOpenArtifact: OpenArtifact;
}) {
  const { t } = useTranslation("run");
  const [url, setUrl] = useState<string | null>(null);
  const label = t(`outputs.artifacts.${artifact.kind}`, { defaultValue: artifact.kind });
  useEffect(() => {
    let active = true;
    void apiGet<{ url: string }>(`/artifacts/${artifact.id}/signed-url`)
      .then((res) => {
        if (active) setUrl(res.url);
      })
      .catch(() => {
        if (active) setUrl(null);
      });
    return () => {
      active = false;
    };
  }, [artifact.id]);
  if (!url) {
    return (
        <button type="button" className="link-btn" onClick={() => void onOpenArtifact(artifact.id)}>
        {label}
      </button>
    );
  }
  return <SignedMedia label={label} url={url} mimeType={artifact.mimeType} />;
}

import { useEffect, useState } from "react";
import { apiGet } from "./api.js";
import type { ArtifactRow, StageName } from "./types.js";
import { videoPromptLabelHe, artifactKindLabelHe, FRAME_TYPE_LABELS_HE, formatApiErrorMessage, type RenderProfileId } from "@studio/shared";

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

function languageLabelHe(code: unknown): string {
  const c = String(code ?? "").toLowerCase();
  if (c.startsWith("he")) return "עברית";
  if (c.startsWith("en")) return "אנגלית";
  if (c.startsWith("fr")) return "צרפתית";
  if (c.startsWith("ar")) return "ערבית";
  if (c.startsWith("ru")) return "רוסית";
  if (c.startsWith("es")) return "ספרדית";
  if (c.startsWith("yi")) return "יידיש";
  return c || "—";
}

function BriefOutputView({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="stage-output">
      <Field label="כותרת" value={data.title} />
      <Field label="סיכום" value={data.summary} />
      <Field label="קהל יעד" value={data.targetAudience} />
      <Field label="טון" value={data.toneOfVoice} />
      <Field label="סגנון" value={data.style} />
      <Field label="כיוון ויזואלי" value={data.visualDirection} />
      <Field label="כיוון מוזיקה" value={data.musicDirection} />
      {data.callToAction ? <Field label="קריאה לפעולה" value={data.callToAction} /> : null}
      <small className="muted">
        משך: {String(data.durationSeconds ?? "?")} שניות · יחס: {String(data.aspectRatio ?? "?")} · שפה:{" "}
        {languageLabelHe(data.language)}
      </small>
    </div>
  );
}

function ScriptOutputView({ data, renderProfileId }: { data: Record<string, unknown>; renderProfileId?: RenderProfileId | null }) {
  const scenes = Array.isArray(data.scenes) ? (data.scenes as Array<Record<string, unknown>>) : [];
  const promptLabel = videoPromptLabelHe(renderProfileId ?? "veo-multiclip");
  return (
    <div className="stage-output">
      <Field label="רקע ויזואלי" value={data.backgroundVisualPrompt} />
      <Field label="תיאור דמויות (נעול)" value={data.characterBible} />
      {data.visualCorrections ? <Field label="תיקונים ויזואליים" value={data.visualCorrections} /> : null}
      <Field label="פרומпт מוזיקה" value={data.musicPrompt} />
      <div className="scene-list">
        {scenes.map((scene) => (
          <article className="scene-mini" key={String(scene.id)}>
            <strong>
              סצנה {(Number(scene.order) ?? 0) + 1}: {String(scene.title ?? "")}
            </strong>
            <p>{String(scene.narration ?? "")}</p>
            <details className="tech-prompt">
              <summary className="muted">{promptLabel} (טכני)</summary>
              <small className="muted">{String(scene.veoPrompt ?? "—")}</small>
              {scene.referenceImagePrompt ? (
                <small className="muted">
                  תמונת עוגן:{" "}
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
  const perScene = Array.isArray(data.perScene) ? (data.perScene as Array<Record<string, unknown>>) : [];
  const music = (data.music ?? {}) as Record<string, unknown>;
  const musicArtifact = artifacts.find((a) => a.kind === "music_track");
  return (
    <div className="stage-output">
      {perScene.map((row, index) => {
        const artifact = artifacts.find((a) => a.id === row.voiceArtifactId);
        return (
          <article className="scene-mini" key={String(row.sceneId)}>
            <strong>קול · סצנה {index + 1}</strong>
            {artifact ? (
              <ArtifactPlayer artifact={artifact} onOpenArtifact={onOpenArtifact} />
            ) : row.voiceError ? (
              <small className="error-inline">{localizeProviderError(String(row.voiceError))}</small>
            ) : (
              <small className="muted">אין קובץ קול</small>
            )}
          </article>
        );
      })}
      <article className="scene-mini">
        <strong>מוזיקה</strong>
        {music.unavailableReason ? (
          <p className="warn-inline">מוזיקה לא זמינה: {String(music.unavailableReason)}</p>
        ) : musicArtifact ? (
          <ArtifactPlayer artifact={musicArtifact} onOpenArtifact={onOpenArtifact} />
        ) : (
          <small className="muted">{music.artifactId ? "מוזיקה נוצרה" : "ללא מוזיקה"}</small>
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
  const perScene = Array.isArray(data.perScene) ? (data.perScene as Array<Record<string, unknown>>) : [];
  return (
    <div className="stage-output asset-grid asset-grid-stack">
      {perScene.map((row, index) => (
        <article className="scene-mini" key={String(row.sceneId)}>
          <strong>סצנה {index + 1}</strong>
          <FramePreview label={FRAME_TYPE_LABELS_HE.referenceFrame} frame={row.referenceFrame} onOpenArtifact={onOpenArtifact} />
          <FramePreview label={FRAME_TYPE_LABELS_HE.firstFrame} frame={row.firstFrame} onOpenArtifact={onOpenArtifact} />
          <FramePreview label={FRAME_TYPE_LABELS_HE.lastFrame} frame={row.lastFrame} onOpenArtifact={onOpenArtifact} />
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
  const timeline = Array.isArray(data.timeline) ? (data.timeline as Array<Record<string, unknown>>) : [];
  return (
    <div className="stage-output">
      {typeof data.manifestSignedUrl === "string" ? (
        <MediaLink label="מניפסט" url={data.manifestSignedUrl} />
      ) : null}
      {typeof data.instructionsGcsPath === "string" ? (
        <small className="muted">הוראות: {String(data.instructionsGcsPath)}</small>
      ) : null}
      <table className="timeline-table">
        <thead>
          <tr>
            <th>#</th>
            <th>כותרת</th>
            <th>זמן</th>
          </tr>
        </thead>
        <tbody>
          {timeline.map((row) => (
            <tr key={String(row.sceneId)}>
              <td>{Number(row.order) + 1}</td>
              <td>{String(row.title ?? "")}</td>
              <td>
                {Number(row.startSecond)}–{Number(row.endSecond)} שנ׳
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {timeline.slice(0, 3).map((row) => {
        const voice = row.voice as Record<string, unknown> | undefined;
        const url = voice?.signedUrl;
        return typeof url === "string" ? (
          <SignedMedia key={`voice-${String(row.sceneId)}`} label={`קול ${String(row.title)}`} url={url} mimeType="audio/mpeg" />
        ) : null;
      })}
      {typeof data.instructionsArtifactId === "string" ? (
        <button type="button" onClick={() => void onOpenArtifact(data.instructionsArtifactId as string)}>
          פתח הוראות
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
  const finalUrl = typeof data.finalSignedUrl === "string" ? data.finalSignedUrl : null;
  const clipArtifacts = artifacts.filter((a) => a.kind === "scene_rendered_clip" || a.kind === "final_video");
  return (
    <div className="stage-output">
      {finalUrl ? <SignedMedia label="סרטון סופי" url={finalUrl} mimeType="video/mp4" /> : null}
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
  const url = typeof data.finalSignedUrl === "string" ? data.finalSignedUrl : null;
  return (
    <div className="stage-output">
      {url ? (
        <SignedMedia label={data.passthrough ? "סרטון סופי (מרינדור)" : "סרטון סדרה"} url={url} mimeType="video/mp4" />
      ) : null}
      {data.finalArtifactId ? (
        <button type="button" onClick={() => void onOpenArtifact(String(data.finalArtifactId))}>
          פתח קובץ סופי
        </button>
      ) : null}
    </div>
  );
}

function localizeProviderError(message: string): string {
  if (/שיבוט קול לא מוגדר|ELEVENLABS/i.test(message)) {
    return "שיבוט קול לא מוגדר בשרת — יש להגדיר ELEVENLABS_API_KEY.";
  }
  if (/no audio inline data|finishReason=OTHER/i.test(message)) {
    return formatApiErrorMessage(message);
  }
  if (/enqueue_failed|locked by another worker/i.test(message)) {
    return "המשימה נעולה בתור העיבוד. המתן מעט או הרץ מחדש את השלב.";
  }
  if (/Path .* not found|HTTP 404/i.test(message)) {
    return "שירות הרינדור לא מצא את המודל המבוקש. בדוק את הגדרות המודל באדמין והרץ מחדש.";
  }
  return formatApiErrorMessage(message);
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
  const [url, setUrl] = useState<string | null>(null);
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
        {artifactKindLabelHe(artifact.kind)}
      </button>
    );
  }
  return <SignedMedia label={artifactKindLabelHe(artifact.kind)} url={url} mimeType={artifact.mimeType} />;
}

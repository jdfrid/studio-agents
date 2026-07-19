import { useEffect, useState } from "react";
import { apiGet } from "./api.js";
import type { ArtifactRow, StageName } from "./types.js";

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
  onOpenArtifact
}: {
  stage: StageName;
  output: unknown;
  artifacts: ArtifactRow[];
  onOpenArtifact: OpenArtifact;
}) {
  if (!output || typeof output !== "object") return null;
  const data = output as Record<string, unknown>;

  switch (stage) {
    case "brief":
      return <BriefOutputView data={data} />;
    case "script":
      return <ScriptOutputView data={data} />;
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
        {String(data.durationSeconds ?? "?")}s · {String(data.aspectRatio ?? "?")} · {String(data.language ?? "?")}
      </small>
    </div>
  );
}

function ScriptOutputView({ data }: { data: Record<string, unknown> }) {
  const scenes = Array.isArray(data.scenes) ? (data.scenes as Array<Record<string, unknown>>) : [];
  return (
    <div className="stage-output">
      <Field label="מוזיקת רקע" value={data.backgroundVisualPrompt} />
      <Field label="פרומпт מוזיקה" value={data.musicPrompt} />
      <div className="scene-list">
        {scenes.map((scene) => (
          <article className="scene-mini" key={String(scene.id)}>
            <strong>
              סצנה {(Number(scene.order) ?? 0) + 1}: {String(scene.title ?? "")}
            </strong>
            <p>{String(scene.narration ?? "")}</p>
            <small className="muted">Veo: {String(scene.veoPrompt ?? "—")}</small>
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
      {perScene.map((row) => {
        const artifact = artifacts.find((a) => a.id === row.voiceArtifactId);
        return (
          <article className="scene-mini" key={String(row.sceneId)}>
            <strong>קול · סצנה {String(row.sceneId)}</strong>
            {artifact ? (
              <ArtifactPlayer artifact={artifact} onOpenArtifact={onOpenArtifact} />
            ) : row.voiceError ? (
              <small className="error-inline">{String(row.voiceError)}</small>
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
    <div className="stage-output asset-grid">
      {perScene.map((row) => (
        <article className="scene-mini" key={String(row.sceneId)}>
          <strong>סצנה {String(row.sceneId)}</strong>
          <FramePreview label="Reference" frame={row.referenceFrame} onOpenArtifact={onOpenArtifact} />
          <FramePreview label="First" frame={row.firstFrame} onOpenArtifact={onOpenArtifact} />
          <FramePreview label="Last" frame={row.lastFrame} onOpenArtifact={onOpenArtifact} />
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
                {Number(row.startSecond)}–{Number(row.endSecond)}s
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
          פתח הוראות (artifact)
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
      {url ? <SignedMedia label={data.passthrough ? "סרטון סופי (מ-render)" : "סרטון סדרה"} url={url} mimeType="video/mp4" /> : null}
      {data.finalArtifactId ? (
        <button type="button" onClick={() => void onOpenArtifact(String(data.finalArtifactId))}>
          פתח artifact
        </button>
      ) : null}
    </div>
  );
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
  const url = typeof f.signedUrl === "string" ? f.signedUrl : null;
  const artifactId = typeof f.artifactId === "string" ? f.artifactId : null;
  if (url) return <SignedMedia label={label} url={url} mimeType="image/png" />;
  if (artifactId) {
    return (
      <button type="button" className="link-btn" onClick={() => void onOpenArtifact(artifactId)}>
        {label}
      </button>
    );
  }
  return null;
}

function SignedMedia({ label, url, mimeType }: { label: string; url: string; mimeType: string }) {
  if (mimeType.startsWith("video/")) {
    return (
      <figure className="media-preview">
        <figcaption>{label}</figcaption>
        <video controls src={url} />
      </figure>
    );
  }
  if (mimeType.startsWith("audio/")) {
    return (
      <figure className="media-preview">
        <figcaption>{label}</figcaption>
        <audio controls src={url} />
      </figure>
    );
  }
  return (
    <figure className="media-preview">
      <figcaption>{label}</figcaption>
      <img src={url} alt={label} loading="lazy" />
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
        {artifact.kind}
      </button>
    );
  }
  return <SignedMedia label={artifact.kind} url={url} mimeType={artifact.mimeType} />;
}

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiPatch, uploadStageArtifact } from "./api.js";
import type { ProjectRunView, StageName } from "./types.js";

const EDITABLE_STAGES = new Set<StageName>(["brief", "script", "audio", "asset", "package", "render", "series"]);

type UploadAttach =
  | { type: "voice"; sceneId: string }
  | { type: "music" }
  | { type: "referenceFrame" | "firstFrame" | "lastFrame" | "background"; sceneId: string }
  | { type: "sceneClip"; sceneId: string }
  | { type: "final" }
  | { type: "visualAnchor"; sceneId?: string };

function FileUploadField({
  label,
  accept,
  disabled,
  busy,
  onPick
}: {
  label: string;
  accept: string;
  disabled?: boolean;
  busy?: boolean;
  onPick: (file: File) => Promise<void>;
}) {
  const { t } = useTranslation("run");
  const [status, setStatus] = useState<string>("");

  async function handleChange(file: File | undefined) {
    if (!file) return;
    setStatus(t("editor.uploading", { name: file.name }));
    try {
      await onPick(file);
      setStatus(t("editor.uploaded", { name: file.name }));
    } catch (err) {
      setStatus(t("editor.uploadError", { message: (err as Error).message }));
    }
  }

  return (
    <div className="upload-row">
      <span>{label}</span>
      <label className="file-picker-btn">
        {busy ? t("editor.uploadingShort") : t("editor.chooseFile")}
        <input
          type="file"
          accept={accept}
          disabled={disabled || busy}
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            void handleChange(file);
          }}
        />
      </label>
      {status ? <small className="upload-status">{status}</small> : null}
    </div>
  );
}

export function StageEditor({
  runId,
  stage,
  output,
  onSaved
}: {
  runId: string;
  stage: StageName;
  output: unknown;
  onSaved: () => void;
}) {
  const { t } = useTranslation("run");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pretty = useMemo(() => JSON.stringify(output, null, 2), [output]);

  if (!EDITABLE_STAGES.has(stage) || output == null) return null;

  function beginEdit() {
    setDraft(pretty);
    setError("");
    setOpen(true);
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const parsed = JSON.parse(draft) as unknown;
      await apiPatch<ProjectRunView>(`/runs/${runId}/stages/${stage}/output`, parsed);
      setOpen(false);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stage-editor">
      {!open ? (
        <button type="button" className="link-btn" onClick={beginEdit}>
          {t("editor.editStage")}
        </button>
      ) : (
        <div className="editor-panel">
          <strong>{t("editor.manualEdit", { stage: t(`stages.${stage}`) })}</strong>
          <textarea className="editor-textarea" rows={14} value={draft} onChange={(e) => setDraft(e.target.value)} />
          {error ? <p className="error-inline">{error}</p> : null}
          <div className="stage-actions">
            <button type="button" className="primary" disabled={busy} onClick={() => void save()}>
              {busy ? "..." : t("common.save")}
            </button>
            <button type="button" disabled={busy} onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function StageUploadControls({
  runId,
  stage,
  output,
  onSaved
}: {
  runId: string;
  stage: StageName;
  output: unknown;
  onSaved: () => void;
}) {
  const { t } = useTranslation("run");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!output || typeof output !== "object") return null;
  const data = output as Record<string, unknown>;

  async function onFile(file: File, attach: UploadAttach) {
    setBusy(true);
    setError("");
    try {
      const kind = artifactKindForUpload(attach, file.type);
      await uploadStageArtifact(runId, stage, file, { kind, attach });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setBusy(false);
    }
  }

  if (stage === "brief") {
    const anchors = Array.isArray(data.visualAnchors) ? data.visualAnchors : [];
    return (
      <div className="upload-controls">
        <strong>{t("editor.baseImages")}</strong>
        <p className="muted upload-hint">{t("editor.baseImagesHint")}</p>
        <FileUploadField
          label={t("editor.baseCharacters")}
          accept="image/*,video/*"
          busy={busy}
          onPick={(file) => onFile(file, { type: "visualAnchor" })}
        />
        {anchors.length > 0 ? (
          <ul className="anchor-list">
            {anchors.map((a, i) => {
              const row = a as Record<string, unknown>;
              return (
                <li key={i}>
                  {String(row.name ?? row.gcsPath ?? "anchor")} ({String(row.role ?? "anchor")})
                </li>
              );
            })}
          </ul>
        ) : null}
        {error ? <p className="error-inline">{error}</p> : null}
      </div>
    );
  }

  if (stage === "audio") {
    const perScene = Array.isArray(data.perScene) ? (data.perScene as Array<Record<string, unknown>>) : [];
    return (
      <div className="upload-controls">
        <strong>{t("editor.manualUpload")}</strong>
        {perScene.map((row) => (
          <FileUploadField
            key={String(row.sceneId)}
            label={t("editor.voiceScene", { scene: String(row.sceneId) })}
            accept="audio/*"
            busy={busy}
            onPick={(file) => onFile(file, { type: "voice", sceneId: String(row.sceneId) })}
          />
        ))}
        <FileUploadField label={t("editor.music")} accept="audio/*" busy={busy} onPick={(file) => onFile(file, { type: "music" })} />
        {error ? <p className="error-inline">{error}</p> : null}
      </div>
    );
  }

  if (stage === "asset") {
    const perScene = Array.isArray(data.perScene) ? (data.perScene as Array<Record<string, unknown>>) : [];
    return (
      <div className="upload-controls">
        <strong>{t("editor.addVisual")}</strong>
        <FileUploadField
          label={t("editor.wholeVideoBase")}
          accept="image/*,video/*"
          busy={busy}
          onPick={(file) => onFile(file, { type: "visualAnchor" })}
        />
        {perScene.map((row) => (
          <div className="upload-scene" key={String(row.sceneId)}>
            <span>{t("editor.optionalScene", { scene: String(row.sceneId) })}</span>
            {(["referenceFrame", "firstFrame", "lastFrame", "background"] as const).map((frameType) => (
              <FileUploadField
                key={frameType}
                label={t(`outputs.frames.${frameType}`)}
                accept="image/*,video/*"
                busy={busy}
                onPick={(file) => onFile(file, { type: frameType, sceneId: String(row.sceneId) })}
              />
            ))}
          </div>
        ))}
        {error ? <p className="error-inline">{error}</p> : null}
      </div>
    );
  }

  if (stage === "render") {
    const perScene = Array.isArray(data.perScene) ? (data.perScene as Array<Record<string, unknown>>) : [];
    return (
      <div className="upload-controls">
        <strong>{t("editor.replaceClip")}</strong>
        {perScene.map((row) => (
          <FileUploadField
            key={String(row.sceneId)}
            label={t("common.scene", { number: String(row.sceneId) })}
            accept="video/*"
            busy={busy}
            onPick={(file) => onFile(file, { type: "sceneClip", sceneId: String(row.sceneId) })}
          />
        ))}
        <FileUploadField label={t("editor.finalVideo")} accept="video/*" busy={busy} onPick={(file) => onFile(file, { type: "final" })} />
        {error ? <p className="error-inline">{error}</p> : null}
      </div>
    );
  }

  return null;
}

function artifactKindForUpload(attach: UploadAttach, mimeType: string): string {
  switch (attach.type) {
    case "voice":
      return "voice_clip";
    case "music":
      return "music_track";
    case "sceneClip":
      return "scene_rendered_clip";
    case "final":
      return "final_video";
    case "visualAnchor":
      return mimeType.startsWith("video/") ? "scene_video_source" : "scene_image_source";
    case "referenceFrame":
      return "scene_reference_frame";
    case "firstFrame":
      return "scene_first_frame";
    case "lastFrame":
      return "scene_last_frame";
    case "background":
      return mimeType.startsWith("video/") ? "scene_video_source" : "scene_image_source";
    default:
      return "scene_image_source";
  }
}

export function BriefQuickEditor({
  runId,
  output,
  onSaved
}: {
  runId: string;
  output: unknown;
  onSaved: () => void;
}) {
  const { t } = useTranslation("run");
  if (!output || typeof output !== "object") return null;
  const data = output as Record<string, unknown>;
  const [fields, setFields] = useState({
    summary: String(data.summary ?? ""),
    visualDirection: String(data.visualDirection ?? ""),
    musicDirection: String(data.musicDirection ?? ""),
    toneOfVoice: String(data.toneOfVoice ?? "")
  });
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      // Server invalidates downstream stages and enqueues the next stage (script) in auto mode.
      await apiPatch<ProjectRunView>(`/runs/${runId}/stages/brief/output`, { ...data, ...fields });
      onSaved();
    } catch (err) {
      window.alert((err as Error).message || t("editor.quickSaveError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="quick-editor">
      <label>
        {t("editor.summary")}
        <textarea rows={2} value={fields.summary} onChange={(e) => setFields({ ...fields, summary: e.target.value })} />
      </label>
      <label>
        {t("editor.visualDirection")}
        <textarea rows={2} value={fields.visualDirection} onChange={(e) => setFields({ ...fields, visualDirection: e.target.value })} />
      </label>
      <label>
        {t("editor.musicDirection")}
        <textarea rows={2} value={fields.musicDirection} onChange={(e) => setFields({ ...fields, musicDirection: e.target.value })} />
      </label>
      <label>
        {t("editor.tone")}
        <input value={fields.toneOfVoice} onChange={(e) => setFields({ ...fields, toneOfVoice: e.target.value })} />
      </label>
      <button type="button" className="primary" disabled={busy} onClick={() => void save()}>
        {busy ? "..." : t("editor.saveContinue")}
      </button>
    </div>
  );
}

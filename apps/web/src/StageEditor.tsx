import { useMemo, useState } from "react";
import { apiPatch, uploadStageArtifact } from "./api.js";
import type { ProjectRunView, StageName } from "./types.js";

const EDITABLE_STAGES = new Set<StageName>(["brief", "script", "audio", "asset", "package", "render", "series"]);

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
          ערוך שלב
        </button>
      ) : (
        <div className="editor-panel">
          <strong>עריכה ידנית — {stage}</strong>
          <textarea className="editor-textarea" rows={14} value={draft} onChange={(e) => setDraft(e.target.value)} />
          {error ? <p className="error-inline">{error}</p> : null}
          <div className="stage-actions">
            <button type="button" className="primary" disabled={busy} onClick={() => void save()}>
              {busy ? "..." : "שמור"}
            </button>
            <button type="button" disabled={busy} onClick={() => setOpen(false)}>
              ביטול
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!output || typeof output !== "object") return null;
  const data = output as Record<string, unknown>;

  async function onFile(
    file: File,
    attach:
      | { type: "voice"; sceneId: string }
      | { type: "music" }
      | { type: "referenceFrame" | "firstFrame" | "lastFrame" | "background"; sceneId: string }
      | { type: "sceneClip"; sceneId: string }
      | { type: "final" }
  ) {
    setBusy(true);
    setError("");
    try {
      const kind = artifactKindForUpload(attach, file.type);
      await uploadStageArtifact(runId, stage, file, { kind, attach });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (stage === "audio") {
    const perScene = Array.isArray(data.perScene) ? (data.perScene as Array<Record<string, unknown>>) : [];
    return (
      <div className="upload-controls">
        <strong>העלאה ידנית</strong>
        {perScene.map((row) => (
          <label className="upload-row" key={String(row.sceneId)}>
            קול · סצנה {String(row.sceneId)}
            <input
              type="file"
              accept="audio/*"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onFile(file, { type: "voice", sceneId: String(row.sceneId) });
                e.target.value = "";
              }}
            />
          </label>
        ))}
        <label className="upload-row">
          מוזיקה
          <input
            type="file"
            accept="audio/*"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file, { type: "music" });
              e.target.value = "";
            }}
          />
        </label>
        {error ? <p className="error-inline">{error}</p> : null}
      </div>
    );
  }

  if (stage === "asset") {
    const perScene = Array.isArray(data.perScene) ? (data.perScene as Array<Record<string, unknown>>) : [];
    return (
      <div className="upload-controls">
        <strong>הוספת ויזואל ידנית</strong>
        {perScene.map((row) => (
          <div className="upload-scene" key={String(row.sceneId)}>
            <span>סצנה {String(row.sceneId)}</span>
            {(["referenceFrame", "firstFrame", "lastFrame", "background"] as const).map((frameType) => (
              <label className="upload-row" key={frameType}>
                {frameType}
                <input
                  type="file"
                  accept="image/*,video/*"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void onFile(file, { type: frameType, sceneId: String(row.sceneId) });
                    e.target.value = "";
                  }}
                />
              </label>
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
        <strong>החלפת קlip ידנית</strong>
        {perScene.map((row) => (
          <label className="upload-row" key={String(row.sceneId)}>
            סצנה {String(row.sceneId)}
            <input
              type="file"
              accept="video/*"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onFile(file, { type: "sceneClip", sceneId: String(row.sceneId) });
                e.target.value = "";
              }}
            />
          </label>
        ))}
        <label className="upload-row">
          סרטון סופי
          <input
            type="file"
            accept="video/*"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file, { type: "final" });
              e.target.value = "";
            }}
          />
        </label>
        {error ? <p className="error-inline">{error}</p> : null}
      </div>
    );
  }

  return null;
}

function artifactKindForUpload(
  attach:
    | { type: "voice" }
    | { type: "music" }
    | { type: "referenceFrame" | "firstFrame" | "lastFrame" | "background" }
    | { type: "sceneClip" }
    | { type: "final" },
  mimeType: string
): string {
  switch (attach.type) {
    case "voice":
      return "voice_clip";
    case "music":
      return "music_track";
    case "sceneClip":
      return "scene_rendered_clip";
    case "final":
      return "final_video";
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
      await apiPatch<ProjectRunView>(`/runs/${runId}/stages/brief/output`, { ...data, ...fields });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="quick-editor">
      <label>
        סיכום
        <textarea rows={2} value={fields.summary} onChange={(e) => setFields({ ...fields, summary: e.target.value })} />
      </label>
      <label>
        כיוון ויזואלי
        <textarea rows={2} value={fields.visualDirection} onChange={(e) => setFields({ ...fields, visualDirection: e.target.value })} />
      </label>
      <label>
        כיוון מוזיקה
        <textarea rows={2} value={fields.musicDirection} onChange={(e) => setFields({ ...fields, musicDirection: e.target.value })} />
      </label>
      <label>
        טון
        <input value={fields.toneOfVoice} onChange={(e) => setFields({ ...fields, toneOfVoice: e.target.value })} />
      </label>
      <button type="button" disabled={busy} onClick={() => void save()}>
        {busy ? "..." : "שמור בריף"}
      </button>
    </div>
  );
}

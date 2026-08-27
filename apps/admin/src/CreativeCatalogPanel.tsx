import { useEffect, useMemo, useState } from "react";
import type { AdminCreativeField } from "@studio/shared";
import { apiDelete, apiGet, apiPatch, apiPost } from "./api.js";

export function CreativeCatalogPanel() {
  const [fields, setFields] = useState<AdminCreativeField[]>([]);
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setFields(await apiGet<AdminCreativeField[]>("/admin/creative-catalog"));
  }

  useEffect(() => {
    void refresh().catch((error) => setMessage((error as Error).message));
  }, []);

  const visible = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return fields;
    return fields.filter((field) =>
      [field.key, field.sectionKey, field.labels.he, field.labels.en].some((value) =>
        value.toLowerCase().includes(query)
      )
    );
  }, [fields, filter]);

  async function mutate(action: () => Promise<AdminCreativeField[]>) {
    setBusy(true);
    setMessage("");
    try {
      setFields(await action());
      setMessage("נשמר בהצלחה.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addField() {
    const key = window.prompt("מפתח קבוע באנגלית, לדוגמה cameraMood");
    if (!key) return;
    const labelHe = window.prompt("שם השדה בעברית");
    const labelEn = window.prompt("Field name in English");
    if (!labelHe || !labelEn) return;
    await mutate(() =>
      apiPost("/admin/creative-catalog/fields", {
        key,
        sectionKey: "custom",
        kind: "select",
        labels: { he: labelHe, en: labelEn },
        sectionLabels: { he: "מותאם אישית", en: "Custom" },
        config: {}
      })
    );
  }

  async function moveField(field: AdminCreativeField, direction: -1 | 1) {
    const ordered = [...fields];
    const index = ordered.findIndex((item) => item.id === field.id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= ordered.length) return;
    [ordered[index], ordered[next]] = [ordered[next]!, ordered[index]!];
    await mutate(() =>
      apiPost("/admin/creative-catalog/fields/reorder", { ids: ordered.map((item) => item.id) })
    );
  }

  return (
    <section className="admin-settings creative-catalog-admin">
      <div className="section-title-row">
        <div>
          <h3>שדות ואפשרויות</h3>
          <p className="muted">ניהול תוויות וערכים בעברית ובאנגלית. מחיקה משביתה ערכים בלי לפגוע בריצות ישנות.</p>
        </div>
        <button type="button" className="primary" disabled={busy} onClick={() => void addField()}>
          הוספת שדה
        </button>
      </div>
      <label>
        חיפוש
        <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="מפתח, מקטע או תווית" />
      </label>
      <div className="creative-catalog-list">
        {visible.map((field) => (
          <CreativeFieldCard
            key={field.id}
            field={field}
            busy={busy}
            mutate={mutate}
            move={(direction) => void moveField(field, direction)}
          />
        ))}
      </div>
      {message ? <p className={message.includes("בהצלחה") ? "muted" : "error-inline"}>{message}</p> : null}
    </section>
  );
}

function CreativeFieldCard({
  field,
  busy,
  mutate,
  move
}: {
  field: AdminCreativeField;
  busy: boolean;
  mutate: (action: () => Promise<AdminCreativeField[]>) => Promise<void>;
  move: (direction: -1 | 1) => void;
}) {
  const [draft, setDraft] = useState(field);

  useEffect(() => setDraft(field), [field]);

  async function saveField() {
    await mutate(() =>
      apiPatch(`/admin/creative-catalog/fields/${field.id}`, {
        labels: draft.labels,
        sectionLabels: draft.sectionLabels,
        helpText: draft.helpText,
        placeholders: draft.placeholders,
        config: draft.config
      })
    );
  }

  async function addOption() {
    const code = window.prompt("קוד קבוע באנגלית, לדוגמה clean_modern");
    const value = window.prompt("ערך סמנטי שיועבר למנוע");
    const he = window.prompt("תווית בעברית");
    const en = window.prompt("Label in English");
    if (!code || !value || !he || !en) return;
    await mutate(() =>
      apiPost(`/admin/creative-catalog/fields/${field.id}/options`, {
        code,
        value,
        labels: { he, en }
      })
    );
  }

  async function moveOption(optionId: string, direction: -1 | 1) {
    const ordered = [...field.options];
    const index = ordered.findIndex((item) => item.id === optionId);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= ordered.length) return;
    [ordered[index], ordered[next]] = [ordered[next]!, ordered[index]!];
    await mutate(() =>
      apiPost(`/admin/creative-catalog/fields/${field.id}/options/reorder`, {
        ids: ordered.map((item) => item.id)
      })
    );
  }

  return (
    <details className="creative-admin-field">
      <summary>
        <span><strong>{field.labels.he}</strong><small>{field.key} · {field.sectionKey}</small></span>
        <span className={field.active ? "badge badge-completed" : "badge badge-pending"}>
          {field.active ? "פעיל" : "מושבת"}
        </span>
      </summary>
      <div className="creative-admin-field-body">
        <div className="settings-models">
          <BilingualInputs
            title="שם השדה"
            value={draft.labels}
            onChange={(labels) => setDraft({ ...draft, labels })}
          />
          <BilingualInputs
            title="שם המקטע"
            value={draft.sectionLabels}
            onChange={(sectionLabels) => setDraft({ ...draft, sectionLabels })}
          />
          <BilingualInputs
            title="טקסט עזרה"
            value={draft.helpText}
            onChange={(helpText) => setDraft({ ...draft, helpText })}
          />
          <BilingualInputs
            title="Placeholder"
            value={draft.placeholders}
            onChange={(placeholders) => setDraft({ ...draft, placeholders })}
          />
        </div>
        <div className="stage-actions">
          <button type="button" disabled={busy} onClick={() => void saveField()}>שמור שדה</button>
          <button type="button" disabled={busy} onClick={() => move(-1)}>העבר למעלה</button>
          <button type="button" disabled={busy} onClick={() => move(1)}>העבר למטה</button>
          <button
            type="button"
            disabled={busy || field.isRequired || field.isProtected}
            onClick={() =>
              void mutate(() =>
                apiPatch(`/admin/creative-catalog/fields/${field.id}/active`, { active: !field.active })
              )
            }
          >
            {field.active ? "השבת" : "הפעל"}
          </button>
          <button
            type="button"
            className="danger"
            disabled={busy || field.isRequired || field.isProtected}
            onClick={() => {
              if (window.confirm("להשבית ולמחוק את השדה מהקטלוג הפעיל?")) {
                void mutate(() => apiDelete(`/admin/creative-catalog/fields/${field.id}`));
              }
            }}
          >
            מחיקה
          </button>
        </div>
        {field.kind === "select" ? (
          <div className="creative-admin-options">
            <div className="section-title-row">
              <h4>אפשרויות</h4>
              <button type="button" disabled={busy} onClick={() => void addOption()}>הוספת אפשרות</button>
            </div>
            {field.options.map((option) => (
              <CreativeOptionRow
                key={option.id}
                fieldId={field.id}
                option={option}
                busy={busy}
                mutate={mutate}
                move={(direction) => void moveOption(option.id, direction)}
              />
            ))}
          </div>
        ) : null}
      </div>
    </details>
  );
}

function CreativeOptionRow({
  option,
  busy,
  mutate,
  move
}: {
  fieldId: string;
  option: AdminCreativeField["options"][number];
  busy: boolean;
  mutate: (action: () => Promise<AdminCreativeField[]>) => Promise<void>;
  move: (direction: -1 | 1) => void;
}) {
  const [labels, setLabels] = useState(option.labels);
  const [value, setValue] = useState(option.value);
  useEffect(() => setLabels(option.labels), [option]);
  useEffect(() => setValue(option.value), [option]);
  return (
    <div className="creative-admin-option">
      <code>{option.code}</code>
      <input value={value} aria-label="ערך סמנטי" onChange={(event) => setValue(event.target.value)} />
      <input value={labels.he} aria-label="עברית" onChange={(event) => setLabels({ ...labels, he: event.target.value })} />
      <input value={labels.en} aria-label="English" dir="ltr" onChange={(event) => setLabels({ ...labels, en: event.target.value })} />
      <div className="stage-actions">
        <button type="button" disabled={busy} onClick={() => void mutate(() => apiPatch(`/admin/creative-catalog/options/${option.id}`, { value, labels }))}>שמור</button>
        <button type="button" disabled={busy} onClick={() => move(-1)}>↑</button>
        <button type="button" disabled={busy} onClick={() => move(1)}>↓</button>
        <button type="button" disabled={busy} onClick={() => void mutate(() => apiPatch(`/admin/creative-catalog/options/${option.id}/active`, { active: !option.active }))}>{option.active ? "השבת" : "הפעל"}</button>
        <button type="button" className="danger" disabled={busy} onClick={() => void mutate(() => apiDelete(`/admin/creative-catalog/options/${option.id}`))}>מחק</button>
      </div>
    </div>
  );
}

function BilingualInputs({
  title,
  value,
  onChange
}: {
  title: string;
  value: { he: string; en: string };
  onChange: (value: { he: string; en: string }) => void;
}) {
  return (
    <fieldset>
      <legend>{title}</legend>
      <label>עברית<input value={value.he} onChange={(event) => onChange({ ...value, he: event.target.value })} /></label>
      <label>English<input dir="ltr" value={value.en} onChange={(event) => onChange({ ...value, en: event.target.value })} /></label>
    </fieldset>
  );
}

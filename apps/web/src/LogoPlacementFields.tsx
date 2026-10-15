import { CREATIVE_FIELD_SECTIONS, type CreativeOptions } from "@studio/shared";

export const LOGO_FIELD_KEYS = new Set<keyof CreativeOptions>(["logoPlacement", "logoPositionY", "logoPositionX"]);

type LogoKey = "logoPlacement" | "logoPositionY" | "logoPositionX";

/** Logo placement + on-video position (shown only for "over the whole video"). */
export function LogoPlacementFields({
  locale,
  creative,
  autoLabel,
  help,
  disabled,
  onChange
}: {
  locale: "he" | "en";
  creative: CreativeOptions;
  autoLabel: string;
  help: string;
  disabled?: boolean;
  onChange: (key: LogoKey, value: string) => void;
}) {
  const fields = CREATIVE_FIELD_SECTIONS.flatMap((section) => section.fields).filter((field) =>
    LOGO_FIELD_KEYS.has(field.key)
  );
  const overlay = creative.logoPlacement === "always";
  const defaults: Partial<Record<LogoKey, string>> = { logoPositionY: "top", logoPositionX: "right" };

  return (
    <div className="logo-placement-fields">
      <div className="logo-placement-grid">
        {fields.map((field) => {
          const key = field.key as LogoKey;
          if (key !== "logoPlacement" && !overlay) return null;
          const label = locale === "en" ? (field.labelEn ?? field.labelHe) : field.labelHe;
          return (
            <label key={key}>
              {label}
              <select
                value={String(creative[key] ?? (key === "logoPlacement" ? "" : defaults[key]))}
                disabled={disabled}
                onChange={(event) => onChange(key, event.target.value)}
              >
                {key === "logoPlacement" ? <option value="">{autoLabel}</option> : null}
                {(field.options ?? []).map((option) => (
                  <option key={option.value} value={option.value}>
                    {locale === "en" ? (option.labelEn ?? option.labelHe) : option.labelHe}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
      <small className="muted">{help}</small>
    </div>
  );
}

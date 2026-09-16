import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiPost } from "./api.js";
import { VOICE_CHARACTER_PRESETS, type VoiceCharacterId } from "@studio/shared";

export function VoicePreview({
  voiceCharacter,
  language,
  disabled
}: {
  voiceCharacter?: string;
  language: string;
  disabled?: boolean;
}) {
  const { t, i18n } = useTranslation("createVideo");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function play(id = voiceCharacter) {
    if (disabled || !id) return;
    setBusy(true);
    setError("");
    try {
      audioRef.current?.pause();
      const res = await apiPost<{ mimeType: string; audioBase64: string }>("/tts/preview", {
        voiceCharacter: id,
        language
      });
      const url = `data:${res.mimeType};base64,${res.audioBase64}`;
      const audio = new Audio(url);
      audioRef.current = audio;
      await audio.play();
    } catch (err) {
      setError((err as Error).message || t("voice.previewError"));
    } finally {
      setBusy(false);
    }
  }

  const preset = VOICE_CHARACTER_PRESETS.find((item) => item.id === voiceCharacter);
  const label = preset ? (i18n.resolvedLanguage?.startsWith("he") ? preset.labelHe : preset.labelEn) : "";

  return (
    <div className="voice-preview">
      <button type="button" className="button-secondary" disabled={disabled || busy || !voiceCharacter} onClick={() => void play()}>
        {busy ? t("voice.previewing") : t("voice.preview")}
      </button>
      {preset ? <small className="muted">{label}</small> : null}
      {error ? <small className="error-inline">{error}</small> : null}
    </div>
  );
}

export function VoicePicker({
  value,
  language,
  disabled,
  onChange
}: {
  value?: string;
  language: string;
  disabled?: boolean;
  onChange: (id: VoiceCharacterId) => void;
}) {
  const { t, i18n } = useTranslation("createVideo");
  const hebrew = i18n.resolvedLanguage?.startsWith("he");

  return (
    <div className="voice-picker">
      <p className="field-help">{t("voice.pickHelp")}</p>
      <div className="voice-cards" role="listbox" aria-label={t("voice.preview")}>
        {VOICE_CHARACTER_PRESETS.filter((item) => item.age === "adult").map((preset) => {
          const selected = value === preset.id;
          return (
            <div key={preset.id} className={`voice-card${selected ? " is-selected" : ""}`}>
              <button type="button" disabled={disabled} onClick={() => onChange(preset.id)}>
                {hebrew ? preset.labelHe : preset.labelEn}
              </button>
              <VoicePreview voiceCharacter={preset.id} language={language} disabled={disabled} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const VOICE_PRESET_IDS: VoiceCharacterId[] = VOICE_CHARACTER_PRESETS.map((item) => item.id);

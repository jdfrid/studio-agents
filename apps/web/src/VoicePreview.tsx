import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiPost } from "./api.js";
import { VOICE_CHARACTER_PRESETS, type VoiceCharacterId } from "@studio/shared";

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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<VoiceCharacterId | null>(null);
  const [error, setError] = useState("");

  async function play(id: VoiceCharacterId) {
    if (disabled) return;
    audioRef.current?.pause();
    if (playingId === id) {
      setPlayingId(null);
      return;
    }
    setPlayingId(id);
    setError("");
    try {
      const res = await apiPost<{ mimeType: string; audioBase64: string }>("/tts/preview", {
        voiceCharacter: id,
        language
      });
      const audio = new Audio(`data:${res.mimeType};base64,${res.audioBase64}`);
      audioRef.current = audio;
      audio.addEventListener("ended", () => setPlayingId((current) => (current === id ? null : current)));
      await audio.play();
    } catch (err) {
      setError((err as Error).message || t("voice.previewError"));
      setPlayingId(null);
    }
  }

  const adults = VOICE_CHARACTER_PRESETS.filter((item) => item.age === "adult");
  const groups = (["adult_male", "adult_female", "character"] as const)
    .map((group) => ({ group, items: adults.filter((item) => item.group === group) }))
    .filter((entry) => entry.items.length);
  const groupLabel = { adult_male: t("voice.groupMale"), adult_female: t("voice.groupFemale"), character: t("voice.groupCharacter") };
  /** "Man — clear" reads as "clear" under the "Men" heading; the full label stays in the play button's name. */
  const shortLabel = (label: string) => label.split(/\s+[—–-]\s+/).pop() ?? label;

  return (
    <div className="voice-picker">
      <p className="field-help">{t("voice.pickHelp")}</p>
      {groups.map(({ group, items }) => (
        <div key={group} className="voice-group">
          <p className="voice-group-title">{groupLabel[group]}</p>
          <div className="voice-cards" role="radiogroup" aria-label={groupLabel[group]}>
            {items.map((preset) => {
              const selected = value === preset.id;
              const full = hebrew ? preset.labelHe : preset.labelEn;
              const name = shortLabel(full);
              const playing = playingId === preset.id;
              return (
                <div key={preset.id} className={`voice-card${selected ? " is-selected" : ""}`}>
                  <button
                    type="button"
                    className="voice-card-play"
                    disabled={disabled}
                    aria-label={t("voice.playSample", { name: full })}
                    title={t("voice.playSample", { name: full })}
                    onClick={() => void play(preset.id)}
                  >
                    <span aria-hidden>{playing ? "■" : "▶"}</span>
                  </button>
                  <button
                    type="button"
                    className="voice-card-name"
                    role="radio"
                    aria-checked={selected}
                    disabled={disabled}
                    onClick={() => onChange(preset.id)}
                  >
                    {name}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {error ? <small className="error-inline">{error}</small> : null}
    </div>
  );
}

export const VOICE_PRESET_IDS: VoiceCharacterId[] = VOICE_CHARACTER_PRESETS.map((item) => item.id);

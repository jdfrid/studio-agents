import { useEffect, useState } from "react";
import { isMobileDevice } from "./device.js";

export function CameraCaptureButton({
  capture,
  label,
  onFiles,
  disabled
}: {
  capture: "user" | "environment";
  label: string;
  onFiles: (files: FileList) => void;
  disabled?: boolean;
}) {
  return (
    <label className={disabled ? "camera-capture-btn is-disabled" : "camera-capture-btn"}>
      <input
        type="file"
        accept="image/*"
        capture={capture}
        disabled={disabled}
        onChange={(event) => {
          if (event.target.files?.length) onFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <span>{label}</span>
    </label>
  );
}

export function useIsMobileDevice(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    setMobile(isMobileDevice());
  }, []);
  return mobile;
}

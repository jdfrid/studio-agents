export type DeviceHints = {
  userAgent?: string;
  userAgentMobile?: boolean | null;
  maxTouchPoints?: number;
};

const PHONE_UA = /iPhone|iPod|Android.+Mobile|webOS|BlackBerry|IEMobile|Opera Mini|Windows Phone/i;
const TABLET_UA = /iPad|Android(?!.*Mobile)|Tablet/i;

/** True on phones and tablets that typically have a camera. Desktop browsers stay false even when the window is narrow. */
export function isMobileDevice(hints: DeviceHints = {}): boolean {
  const userAgent =
    hints.userAgent ??
    (typeof navigator === "undefined" ? "" : navigator.userAgent);
  const userAgentMobile =
    hints.userAgentMobile ??
    (typeof navigator === "undefined"
      ? null
      : (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile ??
        null);
  const maxTouchPoints =
    hints.maxTouchPoints ?? (typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints || 0);

  if (userAgentMobile === true) return true;
  if (PHONE_UA.test(userAgent) || TABLET_UA.test(userAgent)) return true;
  // iPadOS 13+ reports as Macintosh in Safari.
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return true;
  return false;
}

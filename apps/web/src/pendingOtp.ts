const KEY = "reelmino:pending-otp";
const TTL_MS = 10 * 60 * 1000;

export type PendingOtp = { email: string; expiresAt: number };

export function readPendingOtp(): PendingOtp | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingOtp>;
    if (!parsed.email || typeof parsed.expiresAt !== "number" || parsed.expiresAt < Date.now()) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return { email: parsed.email, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

export function writePendingOtp(email: string): void {
  try {
    const payload: PendingOtp = { email: email.trim(), expiresAt: Date.now() + TTL_MS };
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // Private mode can block storage. The open dialog still shows the code step.
  }
}

export function clearPendingOtp(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Ignore storage failures.
  }
}

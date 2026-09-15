export type WhatsNewEntry = {
  id: string;
  date: string;
};

/** User-facing additions, newest first. Dates are YYYY-MM-DD. */
export const WHATS_NEW_ENTRIES: WhatsNewEntry[] = [
  { id: "mobile-camera", date: "2026-09-15" },
  { id: "remix", date: "2026-09-14" },
  { id: "brand-templates", date: "2026-09-07" }
];

export const WHATS_NEW_STORAGE_KEY = "prompt2spot:whatsNew:lastVisit";
export const WHATS_NEW_REOPEN_KEY = "prompt2spot:whatsNew:reopen";

export function storageKeyFor(base: string, userId?: string | null): string {
  return userId ? `${base}:${userId}` : base;
}

export function todayStamp(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function entriesSince(lastVisit: string | null, catalog = WHATS_NEW_ENTRIES): WhatsNewEntry[] {
  if (!lastVisit) return catalog;
  return catalog.filter((entry) => entry.date > lastVisit);
}

export function readStoredDate(key: string): string | null {
  try {
    const value = window.localStorage.getItem(key);
    return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeStoredDate(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore quota / private mode */
  }
}

export function readReopenEnabled(userId?: string | null): boolean {
  try {
    return window.localStorage.getItem(storageKeyFor(WHATS_NEW_REOPEN_KEY, userId)) === "1";
  } catch {
    return false;
  }
}

export function writeReopenEnabled(userId?: string | null): void {
  try {
    window.localStorage.setItem(storageKeyFor(WHATS_NEW_REOPEN_KEY, userId), "1");
  } catch {
    /* ignore */
  }
}

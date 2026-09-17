export function storageGet(key: string, legacyKey?: string): string | null {
  try {
    return window.localStorage.getItem(key) ?? (legacyKey ? window.localStorage.getItem(legacyKey) : null);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore quota / private mode.
  }
}

export function storageRemove(key: string, legacyKey?: string): void {
  try {
    window.localStorage.removeItem(key);
    if (legacyKey) window.localStorage.removeItem(legacyKey);
  } catch {
    // Ignore.
  }
}

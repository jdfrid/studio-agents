import { countYoutubeUploadAttempts, type GrowthDb } from "./db.js";

export const YOUTUBE_DAILY_UPLOADS = 16;
export const YOUTUBE_DAILY_CODE = "daily_upload_limit";
export const YOUTUBE_DAILY_MESSAGE = "הערוץ כבר העלה 16 סרטונים היום. אין העלאה נוספת עד מחר.";

/** Start of the current calendar day in Asia/Jerusalem, as a UTC ISO timestamp. */
export function jerusalemDayStart(now = new Date()): string {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
  for (const hours of [2, 3]) {
    const instant = new Date(Date.parse(`${day}T00:00:00Z`) - hours * 60 * 60 * 1000);
    const localDay = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jerusalem",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(instant);
    const localTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jerusalem",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).format(instant);
    if (localDay === day && localTime === "00:00") return instant.toISOString();
  }
  return new Date(Date.parse(`${day}T00:00:00Z`) - 2 * 60 * 60 * 1000).toISOString();
}

export function youtubeUploadBlock(db: GrowthDb, destinationId: string, now = new Date()): string | null {
  return countYoutubeUploadAttempts(db, destinationId, jerusalemDayStart(now)) >= YOUTUBE_DAILY_UPLOADS ? YOUTUBE_DAILY_MESSAGE : null;
}

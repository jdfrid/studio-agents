export const TASK_DURATION_OPTIONS = [30, 60, 120, 180, 300, 600] as const;

export function taskDurationSeconds(value: unknown): (typeof TASK_DURATION_OPTIONS)[number] | null {
  const seconds = typeof value === "number" ? value : Number(value);
  return (TASK_DURATION_OPTIONS as readonly number[]).includes(seconds)
    ? (seconds as (typeof TASK_DURATION_OPTIONS)[number])
    : null;
}

export function chosenDuration(value: unknown, fallback = 30): number {
  return taskDurationSeconds(value) ?? taskDurationSeconds(fallback) ?? 30;
}

export function durationPhrase(seconds: number, language: string): string {
  const he = language.startsWith("he");
  if (seconds < 60) return he ? `${seconds} שניות` : `${seconds} seconds`;
  const minutes = Math.round(seconds / 60);
  if (he) return minutes === 1 ? "דקה" : `${minutes} דקות`;
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

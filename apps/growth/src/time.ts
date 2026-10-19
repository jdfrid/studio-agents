type Wall = { y: number; m: number; d: number; hour: number; minute: number; second: number };

function wallClock(date: Date, timeZone: string): Wall {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = map.hour === "24" ? 0 : Number(map.hour);
  return {
    y: Number(map.year),
    m: Number(map.month),
    d: Number(map.day),
    hour,
    minute: Number(map.minute),
    second: Number(map.second)
  };
}

/** Wall-clock time in a timezone, as a UTC Date. */
export function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let pass = 0; pass < 3; pass += 1) {
    const got = wallClock(new Date(utc), timeZone);
    const gotUtc = Date.UTC(got.y, got.m - 1, got.d, got.hour, got.minute, got.second);
    const want = Date.UTC(year, month - 1, day, hour, minute, 0);
    const delta = gotUtc - want;
    if (delta === 0) break;
    utc -= delta;
  }
  return new Date(utc);
}

export function jerusalemDate(now = new Date()): { y: number; m: number; d: number } {
  const wall = wallClock(now, "Asia/Jerusalem");
  return { y: wall.y, m: wall.m, d: wall.d };
}

export function nextMondayIso(from = new Date()): string {
  const today = jerusalemDate(from);
  const utc = new Date(Date.UTC(today.y, today.m - 1, today.d));
  const day = utc.getUTCDay();
  const add = day === 1 ? 0 : (8 - day) % 7;
  utc.setUTCDate(utc.getUTCDate() + add);
  return utc.toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): { y: number; m: number; d: number } {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) throw new Error("invalid date");
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return { y: utc.getUTCFullYear(), m: utc.getUTCMonth() + 1, d: utc.getUTCDate() };
}

export function isoDate(parts: { y: number; m: number; d: number }): string {
  return `${parts.y}-${String(parts.m).padStart(2, "0")}-${String(parts.d).padStart(2, "0")}`;
}

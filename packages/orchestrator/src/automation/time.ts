export function campaignDayKey(now: Date, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return fmt.format(now);
}

export function campaignLocalHour(now: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23"
  });
  return Number(fmt.format(now));
}

export function shouldProduceForLocalHour(now: Date, timeZone: string, hourLocal: number): boolean {
  return campaignLocalHour(now, timeZone) >= hourLocal;
}

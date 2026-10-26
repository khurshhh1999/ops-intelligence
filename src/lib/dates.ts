const DAY_MS = 86_400_000;

/** Day number (days since Unix epoch, UTC) for an ISO date string. */
export function day(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

export function iso(dayNumber: number): string {
  return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10);
}

export function fmtDate(dayNumber: number, withYear = true): string {
  return new Date(dayNumber * DAY_MS).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: withYear ? "numeric" : undefined,
    timeZone: "UTC",
  });
}

export function fmtMonth(dayNumber: number): string {
  const d = new Date(dayNumber * DAY_MS);
  const month = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return `${month} ’${String(d.getUTCFullYear()).slice(2)}`;
}

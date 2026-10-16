const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** A local calendar day as yyyy-mm-dd, the value of an `<input type="date">`. */
export function localDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** From 30 days before today, to today. */
export function defaultRange(today: Date = new Date()): { from: string; to: string } {
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30);
  return { from: localDay(from), to: localDay(today) };
}

function parseDay(day: string): Date | null {
  const match = DAY_PATTERN.exec(day);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Local midnight at the start of the day, in UTC. */
export function dayStartUtc(day: string): string | null {
  return parseDay(day)?.toISOString() ?? null;
}

/** Local midnight after the day, in UTC, so the whole To day is included. */
export function dayEndUtc(day: string): string | null {
  const date = parseDay(day);
  if (!date) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).toISOString();
}

export function isRangeValid(from: string, to: string): boolean {
  return parseDay(from) !== null && parseDay(to) !== null && from <= to;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

export function formatDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
}

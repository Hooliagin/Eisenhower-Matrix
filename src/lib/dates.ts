/** Local calendar date as YYYY-MM-DD (not UTC). */
export function isoDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Monday of the week containing d. */
export function weekStart(d: Date = new Date()): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (r.getDay() + 6) % 7;
  r.setDate(r.getDate() - dow);
  return r;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function weekDays(d: Date = new Date()): Date[] {
  const start = weekStart(d);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export const WEEKDAY_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export function formatLong(d: Date = new Date()): string {
  return d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
}

export function daysUntil(date: string): number {
  return Math.round((parseDate(date).getTime() - parseDate(isoDate()).getTime()) / 86_400_000);
}

/** "heute", "morgen", "in 3 T", "2 T überfällig" */
export function countdown(date: string): string {
  const d = daysUntil(date);
  if (d < 0) return `${-d} T überfällig`;
  if (d === 0) return "heute";
  if (d === 1) return "morgen";
  return `in ${d} T`;
}

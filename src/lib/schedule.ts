import type { Task } from "./types";

export interface Slot {
  task: Task;
  start: Date;
  end: Date;
  running: boolean;
  late: boolean; // fixed-time task that can't start on time
}

const MIN = 60_000;

export function minutesOf(t: Task): number {
  return t.planned_minutes ?? t.estimate_minutes ?? 30;
}

function fixedStart(t: Task, day: Date): Date {
  const [h, m] = t.planned_start!.split(":").map(Number);
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * Lay today's open tasks out from `now`, in list order. A running task stays where it began;
 * tasks with a fixed start time are anchored, and flexible tasks that would collide get pushed past them.
 */
export function buildSchedule(tasks: Task[], now: Date): Slot[] {
  const slots: Slot[] = [];
  let cursor = new Date(Math.ceil(now.getTime() / (5 * MIN)) * 5 * MIN);

  for (const t of tasks.filter((t) => t.started_at)) {
    const start = new Date(t.started_at!);
    const end = new Date(Math.max(start.getTime() + minutesOf(t) * MIN, now.getTime()));
    slots.push({ task: t, start, end, running: true, late: false });
    if (end > cursor) cursor = end;
  }

  const rest = tasks.filter((t) => !t.started_at);
  const fixed = rest.filter((t) => t.planned_start).sort((a, b) => a.planned_start!.localeCompare(b.planned_start!));
  const flexible = rest.filter((t) => !t.planned_start);

  const placeFixed = (t: Task) => {
    const want = fixedStart(t, now);
    const start = want > cursor ? want : cursor;
    const end = new Date(start.getTime() + minutesOf(t) * MIN);
    slots.push({ task: t, start, end, running: false, late: start > want });
    cursor = end;
  };

  for (const t of flexible) {
    const dur = minutesOf(t) * MIN;
    while (fixed.length && fixedStart(fixed[0], now).getTime() < cursor.getTime() + dur) placeFixed(fixed.shift()!);
    const end = new Date(cursor.getTime() + dur);
    slots.push({ task: t, start: cursor, end, running: false, late: false });
    cursor = end;
  }
  fixed.forEach(placeFixed);
  return slots;
}

export function hhmm(d: Date): string {
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export function fmtMinutes(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r}` : `${h} h`;
}

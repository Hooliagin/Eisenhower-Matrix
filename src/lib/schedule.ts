import { isoDate } from "./dates";
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
 * tasks with a fixed start time are anchored. `hard` blocks (appointments, shifts, the ride there)
 * never move – every task is fitted around them; a fixed-time task that collides is marked late.
 */
export function buildSchedule(tasks: Task[], now: Date, hard: Task[] = []): Slot[] {
  const slots: Slot[] = [];
  let cursor = new Date(Math.ceil(now.getTime() / (5 * MIN)) * 5 * MIN);

  const blocks = hard
    .map((t) => ({ task: t, start: fixedStart(t, now), end: new Date(fixedStart(t, now).getTime() + minutesOf(t) * MIN) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  blocks.forEach((b) => slots.push({ ...b, running: false, late: false }));

  /** Earliest start ≥ `from` where `dur` fits without overlapping a hard block. */
  const fit = (from: Date, dur: number) => {
    let start = from;
    for (const b of blocks) if (b.start.getTime() < start.getTime() + dur && b.end > start) start = b.end;
    return start;
  };

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
    const dur = minutesOf(t) * MIN;
    const start = fit(want > cursor ? want : cursor, dur);
    const end = new Date(start.getTime() + dur);
    slots.push({ task: t, start, end, running: false, late: start > want });
    cursor = end;
  };

  const queue = [...flexible];
  while (queue.length) {
    // In list order – but if the next task doesn't fit before a hard block, let a later one that does fill the gap.
    let idx = queue.findIndex((t) => fit(cursor, minutesOf(t) * MIN).getTime() === cursor.getTime());
    if (idx < 0) idx = 0;
    const [t] = queue.splice(idx, 1);
    const dur = minutesOf(t) * MIN;
    while (fixed.length && fixedStart(fixed[0], now).getTime() < fit(cursor, dur).getTime() + dur) placeFixed(fixed.shift()!);
    const start = fit(cursor, dur);
    const end = new Date(start.getTime() + dur);
    slots.push({ task: t, start, end, running: false, late: false });
    cursor = end;
  }
  fixed.forEach(placeFixed);
  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
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

/** Today's open tasks: everything due by today plus the "do" quadrant, in the user's order. */
export function todayTasks<T extends { done: boolean; quadrant: string; due_date: string | null; routine_id?: string | null; anytime?: boolean }>(
  tasks: T[],
  today = isoDate(),
) {
  // A missed routine stays until a newer one of the same routine exists: yesterday's
  // light lamp is replaced by today's, last Sunday's watering waits until it's done.
  const newestRoutineDay = new Map<string, string>();
  for (const t of tasks)
    if (t.routine_id && t.due_date && t.due_date <= today && t.due_date > (newestRoutineDay.get(t.routine_id) ?? ""))
      newestRoutineDay.set(t.routine_id, t.due_date);
  return tasks.filter(
    (t) =>
      !t.done &&
      // quick "anytime" habits live in the home-page Daily row, not in the timed plan
      !t.anytime &&
      (t.quadrant === "do" || (t.due_date && t.due_date <= today)) &&
      !(t.routine_id && t.due_date !== newestRoutineDay.get(t.routine_id)),
  );
}

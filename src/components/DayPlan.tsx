import { useEffect, useState } from "react";
import { updateTask } from "../lib/data";
import { isoDate } from "../lib/dates";
import { buildSchedule, fmtMinutes, hhmm, minutesOf } from "../lib/schedule";
import type { CalendarEvent, Task } from "../lib/types";

interface Props {
  tasks: Task[]; // today's open tasks, in the user's order
  doneToday: Task[];
  events: CalendarEvent[]; // today's events; timed ones become fixed blocks
  patch: (id: string, p: Partial<Task>) => void;
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toTime = (m: number) => `${String(Math.floor((((m % 1440) + 1440) % 1440) / 60)).padStart(2, "0")}:${String(((m % 60) + 60) % 60).padStart(2, "0")}`;

function block(id: string, title: string, start: string, minutes: number, e: CalendarEvent): Task {
  return {
    id, title, notes: null, quadrant: "schedule", position: 0, due_date: e.event_date, done: false, done_at: null,
    source: e.source, created_at: "", estimate_minutes: minutes, actual_minutes: null, started_at: null,
    planned_start: start, planned_minutes: minutes,
  };
}

/** Timed events become fixed blocks; a shift also gets its bike ride there and back (~3 min per km). */
function eventBlocks(e: CalendarEvent): Task[] {
  const start = toMin(e.start_time!);
  const minutes = e.end_time ? Math.max(15, toMin(e.end_time) - start) : 120;
  const main = block(`event-${e.id}`, e.kind === "dienst" ? `Dienst${e.title !== "Dienst" ? `: ${e.title}` : ""}` : e.title, e.start_time!, minutes, e);
  if (e.kind !== "dienst" || !e.ride_km_each_way) return [main];
  const ride = e.ride_km_each_way * 3;
  return [
    block(`event-${e.id}-hin`, `🚲 Hinfahrt (${e.ride_km_each_way} km)`, toTime(start - ride), ride, e),
    main,
    block(`event-${e.id}-rueck`, `🚲 Rückfahrt (${e.ride_km_each_way} km)`, toTime(start + minutes), ride, e),
  ];
}

function askMinutes(question: string, fallback: number): number | null {
  const raw = prompt(question, String(fallback));
  if (raw === null) return null;
  const n = Math.round(Number(raw.replace(",", ".")));
  return n > 0 ? n : null;
}

export default function DayPlan({ tasks, doneToday, events, patch }: Props) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const timed = events.filter((e) => e.start_time).flatMap(eventBlocks);
  const allDay = events.filter((e) => !e.start_time);
  const slots = buildSchedule(tasks, now, timed);
  const endOfDay = slots.length ? slots[slots.length - 1].end : null;
  const factor = tasks[0]?.estimate_factor ?? doneToday[0]?.estimate_factor ?? 1;

  function save(t: Task, p: Partial<Task>) {
    patch(t.id, p);
    void updateTask(t.id, p);
  }

  const start = (t: Task) => save(t, { started_at: new Date().toISOString() });
  const stop = (t: Task) => save(t, { started_at: null });

  function finish(t: Task) {
    // A stopwatch run under 2 minutes is almost always a mis-tap; ask rather than learn from it.
    const measured = t.started_at ? Math.round((Date.now() - new Date(t.started_at).getTime()) / 60_000) : 0;
    const actual =
      measured >= 2 ? measured : askMinutes(`Wie lange hat „${t.title}“ gedauert? (Minuten – leer lassen, wenn egal)`, minutesOf(t));
    save(t, { done: true, done_at: new Date().toISOString(), actual_minutes: actual });
  }

  function editDuration(t: Task) {
    const m = askMinutes(`Geschätzte Dauer für „${t.title}“ in Minuten:`, t.estimate_minutes ?? minutesOf(t));
    if (m) save(t, { estimate_minutes: m });
  }

  function editTime(t: Task) {
    const raw = prompt(`Feste Uhrzeit für „${t.title}“ (z. B. 18:00, leer = flexibel):`, t.planned_start?.slice(0, 5) ?? "");
    if (raw === null) return;
    const m = raw.trim().match(/^(\d{1,2})[:.]?(\d{2})?$/);
    save(t, { planned_start: m ? `${m[1].padStart(2, "0")}:${m[2] ?? "00"}` : null });
  }

  const today = isoDate(now);

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-red-400">Tagesplan · {tasks.length}</h2>
        {endOfDay && <span className="text-xs text-slate-500">fertig ca. {hhmm(endOfDay)}{isoDate(endOfDay) !== today && " (morgen)"}</span>}
      </div>

      {!slots.length && !allDay.length && <p className="text-sm text-slate-500">Nichts mehr geplant für heute. 🎉</p>}

      <ol className="relative flex flex-col gap-1.5">
        {allDay.map((e) => (
          <li key={e.id} className="card border-sky-800/60 px-3 py-2 text-sm text-sky-200">📅 {e.title} <span className="text-xs text-slate-500">· ganztägig</span></li>
        ))}
        {slots.map(({ task: t, start: s, end, running, late }) => {
          if (t.id.startsWith("event-"))
            return (
              <li key={t.id} className="card flex items-center gap-2 border-sky-800/60 bg-sky-900/20 px-3 py-2">
                <span className="w-12 shrink-0 font-mono text-xs leading-tight text-sky-300">
                  {hhmm(s)}
                  <br />
                  <span className="text-slate-600">{hhmm(end)}</span>
                </span>
                <span className="flex-1 text-sm text-sky-100">{t.title.startsWith("🚲") ? t.title : `📅 ${t.title}`}</span>
              </li>
            );
          const learned = (t.history_samples ?? 0) > 0;
          const elapsed = running ? Math.round((now.getTime() - s.getTime()) / 60_000) : 0;
          return (
            <li key={t.id} className={`card flex items-center gap-2 px-3 py-2 ${running ? "border-emerald-600 bg-emerald-600/10" : ""}`}>
              <button onClick={() => editTime(t)} className="w-12 shrink-0 text-left font-mono text-xs leading-tight text-slate-400">
                <span className={t.planned_start ? "text-sky-300" : late ? "text-amber-400" : ""}>{hhmm(s)}</span>
                <br />
                <span className="text-slate-600">{hhmm(end)}</span>
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{t.title}</div>
                <button onClick={() => editDuration(t)} className="text-[11px] text-slate-500">
                  {running ? (
                    <span className="text-emerald-400">läuft seit {fmtMinutes(Math.max(0, elapsed))} · geplant {fmtMinutes(minutesOf(t))}</span>
                  ) : (
                    <>
                      ⏱ {fmtMinutes(minutesOf(t))}
                      {learned ? (
                        <span className="ml-1 text-violet-400">gelernt aus {t.history_samples}×</span>
                      ) : t.estimate_minutes && minutesOf(t) !== t.estimate_minutes ? (
                        <span className="ml-1 text-violet-400">(du: {t.estimate_minutes})</span>
                      ) : !t.estimate_minutes ? (
                        <span className="ml-1">· tippen zum Schätzen</span>
                      ) : null}
                    </>
                  )}
                </button>
              </div>
              {running ? (
                <>
                  <button className="btn-ghost px-2 text-xs" onClick={() => stop(t)} aria-label="abbrechen">✕</button>
                  <button className="btn-primary px-3 text-xs" onClick={() => finish(t)}>✓ Fertig</button>
                </>
              ) : (
                <>
                  <button className="btn-ghost px-2.5" onClick={() => start(t)} aria-label="starten">▶</button>
                  <button className="btn-ghost px-2.5" onClick={() => finish(t)} aria-label="erledigt">✓</button>
                </>
              )}
            </li>
          );
        })}
      </ol>

      {doneToday.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs text-emerald-400">✓ {doneToday.length} heute erledigt</p>
          <ul className="flex flex-col gap-0.5 text-xs text-slate-500">
            {doneToday.map((t) => (
              <li key={t.id} className="flex justify-between gap-2">
                <span className="truncate line-through">{t.title}</span>
                {t.actual_minutes && (
                  <span className="whitespace-nowrap">
                    {fmtMinutes(t.actual_minutes)}
                    {t.estimate_minutes && ` / ${fmtMinutes(t.estimate_minutes)} geschätzt`}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {factor !== 1 && (
        <p className="mt-2 text-[11px] text-violet-300">
          🧠 Du brauchst meist {factor > 1 ? `${Math.round((factor - 1) * 100)} % länger` : `${Math.round((1 - factor) * 100)} % weniger`} als geschätzt – der Plan rechnet das schon ein.
        </p>
      )}
    </section>
  );
}

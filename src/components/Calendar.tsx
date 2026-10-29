import { useState } from "react";
import { createEvent, createTasks, deleteEvent, updateTask, useCalendar, useSessions, useTemplates } from "../lib/data";
import { addDays, isoDate, parseDate, weekStart, WEEKDAY_SHORT } from "../lib/dates";
import type { CalendarEvent, Task } from "../lib/types";

export function daysUntil(date: string): number {
  return Math.round((parseDate(date).getTime() - parseDate(isoDate()).getTime()) / 86_400_000);
}

export function countdown(date: string): string {
  const d = daysUntil(date);
  if (d < 0) return `${-d} T überfällig`;
  if (d === 0) return "heute";
  if (d === 1) return "morgen";
  return `in ${d} T`;
}

const fmtDay = (s: string) => parseDate(s).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" });

/** Upcoming deadlines and events as one sorted list. */
export function Upcoming({ events, deadlines, limitDays }: { events: CalendarEvent[]; deadlines: Task[]; limitDays?: number }) {
  const today = isoDate();
  const items = [
    ...deadlines.filter((t) => !t.done && t.due_date).map((t) => ({ kind: "deadline" as const, date: t.due_date!, title: t.title, time: null, id: t.id })),
    ...events.map((e) => ({
      kind: e.kind === "dienst" ? ("dienst" as const) : ("event" as const),
      date: e.event_date,
      title: e.kind === "dienst" ? `Dienst${e.end_time ? ` bis ${e.end_time.slice(0, 5)}` : e.shift_hours ? ` (${Number(e.shift_hours).toLocaleString("de-DE")} h)` : ""}` : e.title,
      time: e.start_time,
      id: e.id,
    })),
  ]
    .filter((i) => (limitDays === undefined ? i.date >= today : daysUntil(i.date) <= limitDays))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));

  if (!items.length) return <p className="text-sm text-slate-500">Keine anstehenden Termine.</p>;
  return (
    <ul className="flex flex-col gap-1">
      {items.map((i) => {
        const d = daysUntil(i.date);
        return (
          <li key={i.kind + i.id} className="flex items-center gap-2 text-sm">
            <span className={`h-2 w-2 shrink-0 rounded-full ${i.kind === "deadline" ? "bg-red-400" : i.kind === "dienst" ? "bg-violet-400" : "bg-sky-400"}`} />
            <span className="min-w-0 flex-1 truncate">
              {i.kind === "deadline" && <span className="text-slate-500">bis </span>}
              {i.title}
            </span>
            <span className="whitespace-nowrap text-xs text-slate-500">
              {fmtDay(i.date)}
              {i.time && ` · ${i.time.slice(0, 5)}`}
            </span>
            <span className={`w-20 text-right text-xs ${d < 0 ? "text-red-400" : d <= 2 ? "text-amber-400" : "text-slate-500"}`}>{countdown(i.date)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default function Calendar() {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState(isoDate());
  const gridStart = weekStart(month);
  const from = isoDate(addDays(gridStart, -31)); // overdue deadlines in view too
  const { data, setData } = useCalendar(from);
  const { data: sessions } = useSessions();
  const { data: templates } = useTemplates();
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [kind, setKind] = useState<"event" | "deadline" | "dienst">("event");
  const [endTime, setEndTime] = useState("");
  const [rideKm, setRideKm] = useState("13");

  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const today = isoDate();

  const on = (ds: string) => ({
    events: data.events.filter((e) => e.event_date === ds),
    deadlines: data.deadlines.filter((t) => t.due_date === ds),
    workouts: sessions.filter((s) => s.session_date === ds),
  });
  const sel = on(selected);

  async function add() {
    const t = title.trim() || (kind === "dienst" ? "Dienst" : "");
    if (!t) return;
    setTitle("");
    if (kind === "dienst")
      await createEvent({
        title: t,
        event_date: selected,
        start_time: time || null,
        end_time: endTime || null,
        kind: "dienst",
        ride_km_each_way: Number(rideKm) || null,
      });
    else if (kind === "event") await createEvent({ title: t, event_date: selected, start_time: time || null });
    else await createTasks([{ title: t, quadrant: "schedule", due_date: selected }]);
    setTime("");
    setEndTime("");
  }

  function toggleDeadline(t: Task) {
    setData({ ...data, deadlines: data.deadlines.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)) });
    void updateTask(t.id, { done: !t.done });
  }

  return (
    <div className="flex flex-col gap-4 pt-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Kalender</h1>
        <div className="flex items-center gap-1">
          <button className="btn-ghost px-2" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
          <span className="w-32 text-center text-sm">{month.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}</span>
          <button className="btn-ghost px-2" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
        </div>
      </header>

      <div className="card p-2">
        <div className="grid grid-cols-7 text-center text-[11px] text-slate-500">
          {WEEKDAY_SHORT.map((d) => (
            <div key={d} className="py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((d) => {
            const ds = isoDate(d);
            const { events, deadlines, workouts } = on(ds);
            const inMonth = d.getMonth() === month.getMonth();
            return (
              <button
                key={ds}
                onClick={() => setSelected(ds)}
                className={`flex h-12 flex-col items-center rounded-lg pt-1 text-sm ${
                  ds === selected ? "bg-slate-100 text-slate-900" : ds === today ? "bg-slate-800" : ""
                } ${inMonth ? "" : "opacity-30"}`}
              >
                {d.getDate()}
                <span className="mt-0.5 flex gap-0.5">
                  {deadlines.some((t) => !t.done) && <span className="h-1.5 w-1.5 rounded-full bg-red-400" />}
                  {events.some((e) => e.kind !== "dienst") && <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />}
                  {events.some((e) => e.kind === "dienst") && <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />}
                  {workouts.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex justify-center gap-3 text-[10px] text-slate-500">
          <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-red-400" />Deadline</span>
          <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-sky-400" />Termin</span>
          <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-violet-400" />Dienst</span>
          <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />Training</span>
        </div>
      </div>

      <section className="card p-3">
        <h2 className="mb-2 text-sm font-semibold">{parseDate(selected).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}</h2>
        <ul className="flex flex-col gap-1.5 text-sm">
          {sel.events.map((e) => (
            <li key={e.id} className="flex items-center gap-2">
              <span className={`w-12 font-mono text-xs ${e.kind === "dienst" ? "text-violet-300" : "text-sky-300"}`}>{e.start_time?.slice(0, 5) ?? "ganzt."}</span>
              <span className="flex-1">
                {e.kind === "dienst" ? (
                  <>
                    <span className="text-violet-300">Dienst</span>
                    {e.title !== "Dienst" && ` · ${e.title}`}
                    {e.end_time && <span className="text-slate-500"> bis {e.end_time.slice(0, 5)}</span>}
                    {e.shift_hours && <span className="text-slate-500"> · {Number(e.shift_hours).toLocaleString("de-DE")} h</span>}
                    {e.ride_km_each_way && <span className="text-slate-500"> · 🚲 {e.ride_km_each_way * 2} km</span>}
                  </>
                ) : (
                  e.title
                )}
              </span>
              <button className="text-xs text-slate-600" onClick={() => confirm(`„${e.title}“ löschen?`) && void deleteEvent(e.id)}>✕</button>
            </li>
          ))}
          {sel.deadlines.map((t) => (
            <li key={t.id} className="flex items-center gap-2">
              <button
                onClick={() => toggleDeadline(t)}
                className={`ml-1 mr-5 h-4 w-4 rounded-full border ${t.done ? "border-emerald-500 bg-emerald-500" : "border-red-400"}`}
              />
              <span className={`flex-1 ${t.done ? "text-slate-500 line-through" : ""}`}>
                <span className="text-red-400">Deadline:</span> {t.title}
              </span>
            </li>
          ))}
          {sel.workouts.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-emerald-300">
              <span className="w-12 text-xs">🏋️</span>
              {templates.find((t) => t.id === s.template_id)?.name ?? "Training"}
            </li>
          ))}
          {!sel.events.length && !sel.deadlines.length && !sel.workouts.length && <li className="text-slate-500">Nichts eingetragen.</li>}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-800 pt-3">
          <div className="flex w-full gap-1">
            {(["event", "deadline", "dienst"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`rounded-full px-2.5 py-1 text-xs ${kind === k ? "bg-slate-100 text-slate-900" : "bg-slate-800 text-slate-400"}`}
              >
                {k === "event" ? "Termin" : k === "deadline" ? "Deadline" : "Dienst"}
              </button>
            ))}
          </div>
          <input
            className="min-w-0 flex-1 py-1.5 text-sm"
            placeholder={kind === "event" ? "Termin…" : kind === "dienst" ? "Dienst (optional: Notiz)" : "Was muss bis dahin fertig sein?"}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          {kind !== "deadline" && <input type="time" className="w-28 py-1.5 text-sm" value={time} onChange={(e) => setTime(e.target.value)} title="Beginn" />}
          {kind === "dienst" && (
            <div className="flex w-full items-center gap-2 text-xs text-slate-400">
              bis <input type="time" className="w-28 py-1.5 text-sm" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              🚲 <input inputMode="numeric" className="w-14 py-1.5 text-center text-sm" value={rideKm} onChange={(e) => setRideKm(e.target.value)} /> km je Weg
            </div>
          )}
          <button className="btn-primary" onClick={add}>+</button>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-300">Demnächst</h2>
        <Upcoming events={data.events} deadlines={data.deadlines} />
      </section>
    </div>
  );
}

import { useState } from "react";
import { streak, toggleHabit, useHabits } from "../lib/data";
import { supabase } from "../lib/supabase";
import { addDays, isoDate, weekDays, weekStart, WEEKDAY_SHORT } from "../lib/dates";
import type { Habit, HabitLog } from "../lib/types";

export function HabitToday({ habits, logs, onToggle }: { habits: Habit[]; logs: HabitLog[]; onToggle: (h: Habit, date: string, on: boolean) => void }) {
  const today = isoDate();
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {habits.map((h) => {
        const on = logs.some((l) => l.habit_id === h.id && l.log_date === today);
        const s = streak(logs, h.id);
        return (
          <button
            key={h.id}
            onClick={() => onToggle(h, today, !on)}
            className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm transition ${
              on ? "border-emerald-500/60 bg-emerald-500/15" : "border-slate-800 bg-slate-900/60"
            }`}
          >
            <span className="text-xl">{h.emoji ?? "•"}</span>
            <span className="flex-1 leading-tight">
              {h.name}
              {s > 1 && <span className="block text-[10px] text-amber-400">🔥 {s} Tage</span>}
            </span>
            <span className={`h-5 w-5 rounded-full border ${on ? "border-emerald-400 bg-emerald-400" : "border-slate-600"}`} />
          </button>
        );
      })}
    </div>
  );
}

export function useHabitToggle() {
  const q = useHabits();
  const toggle = (h: Habit, date: string, on: boolean) => {
    const logs = on ? [...q.data.logs, { habit_id: h.id, log_date: date }] : q.data.logs.filter((l) => !(l.habit_id === h.id && l.log_date === date));
    q.setData({ ...q.data, logs });
    void toggleHabit(h.id, date, on);
  };
  return { ...q, toggle };
}

export default function Habits() {
  const { data, toggle, refresh } = useHabitToggle();
  const [offset, setOffset] = useState(0);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [target, setTarget] = useState(7);

  const ref = addDays(new Date(), offset * 7);
  const days = weekDays(ref);
  const today = isoDate();

  async function add() {
    if (!name.trim()) return;
    await supabase.from("habits").insert({ name: name.trim(), emoji: emoji || null, target_per_week: target, position: data.habits.length + 1 });
    setName("");
    setEmoji("");
    void refresh();
  }

  async function archive(h: Habit) {
    if (!confirm(`„${h.name}“ archivieren?`)) return;
    await supabase.from("habits").update({ active: false }).eq("id", h.id);
    void refresh();
  }

  // Last 12 weeks heat strip per habit
  const weeks = Array.from({ length: 12 }, (_, i) => addDays(weekStart(), -7 * (11 - i)));

  return (
    <div className="flex flex-col gap-4 pt-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Habits</h1>
        <div className="flex items-center gap-1">
          <button className="btn-ghost px-2" onClick={() => setOffset(offset - 1)}>‹</button>
          <span className="w-24 text-center text-xs text-slate-400">
            {offset === 0 ? "Diese Woche" : `${days[0].getDate()}.${days[0].getMonth() + 1}. – ${days[6].getDate()}.${days[6].getMonth() + 1}.`}
          </span>
          <button className="btn-ghost px-2" disabled={offset >= 0} onClick={() => setOffset(offset + 1)}>›</button>
        </div>
      </header>

      <div className="card overflow-x-auto p-3">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500">
              <th className="text-left font-normal">Habit</th>
              {days.map((d, i) => (
                <th key={i} className={`w-9 font-normal ${isoDate(d) === today ? "text-white" : ""}`}>
                  {WEEKDAY_SHORT[i]}
                </th>
              ))}
              <th className="w-12 font-normal">Ziel</th>
            </tr>
          </thead>
          <tbody>
            {data.habits.map((h) => {
              const count = days.filter((d) => data.logs.some((l) => l.habit_id === h.id && l.log_date === isoDate(d))).length;
              return (
                <tr key={h.id} className="border-t border-slate-800">
                  <td className="py-2 pr-2">
                    <button onClick={() => archive(h)} className="text-left">
                      {h.emoji} {h.name}
                    </button>
                  </td>
                  {days.map((d) => {
                    const ds = isoDate(d);
                    const on = data.logs.some((l) => l.habit_id === h.id && l.log_date === ds);
                    const future = ds > today;
                    return (
                      <td key={ds} className="text-center">
                        <button
                          disabled={future}
                          onClick={() => toggle(h, ds, !on)}
                          className={`h-7 w-7 rounded-md border ${on ? "border-emerald-500 bg-emerald-500" : "border-slate-700"} disabled:opacity-20`}
                        />
                      </td>
                    );
                  })}
                  <td className={`text-center text-xs ${count >= h.target_per_week ? "text-emerald-400" : "text-slate-400"}`}>
                    {count}/{h.target_per_week}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card p-3">
        <h2 className="mb-2 text-sm font-semibold text-slate-300">Letzte 12 Wochen</h2>
        <div className="flex flex-col gap-2">
          {data.habits.map((h) => (
            <div key={h.id} className="flex items-center gap-2">
              <span className="w-28 truncate text-xs text-slate-400">{h.emoji} {h.name}</span>
              <div className="flex flex-1 gap-0.5">
                {weeks.map((w) => {
                  const n = Array.from({ length: 7 }, (_, i) => isoDate(addDays(w, i))).filter((ds) =>
                    data.logs.some((l) => l.habit_id === h.id && l.log_date === ds),
                  ).length;
                  const pct = Math.min(1, n / h.target_per_week);
                  return <div key={w.toISOString()} title={`${n}/${h.target_per_week}`} className="h-4 flex-1 rounded-sm bg-emerald-500" style={{ opacity: 0.08 + pct * 0.92 }} />;
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card flex flex-wrap items-center gap-2 p-3">
        <input className="w-14 text-center" placeholder="🙂" value={emoji} onChange={(e) => setEmoji(e.target.value)} />
        <input className="min-w-0 flex-1" placeholder="Neuer Habit" value={name} onChange={(e) => setName(e.target.value)} />
        <select value={target} onChange={(e) => setTarget(Number(e.target.value))}>
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <option key={n} value={n}>{n}×/Woche</option>
          ))}
        </select>
        <button className="btn-primary" onClick={add}>Hinzufügen</button>
        <p className="w-full text-[11px] text-slate-500">Tipp auf einen Habit-Namen zum Archivieren.</p>
      </div>
    </div>
  );
}

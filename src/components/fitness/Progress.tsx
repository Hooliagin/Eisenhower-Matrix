import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { isoWeek, parseDate, weekStart } from "../../lib/dates";
import type { Exercise, SetLog } from "../../lib/types";
import { e1rm, fmtSet } from "./format";

type Row = SetLog & { workout_sessions: { session_date: string } };

interface WeekStat {
  key: string;
  label: string;
  top: Row;
  best: number;
  volume: number;
  sets: number;
}

function mostCommon(xs: number[]): number {
  const c = new Map<number, number>();
  xs.forEach((x) => c.set(x, (c.get(x) ?? 0) + 1));
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${30 - ((v - min) / span) * 26 - 2}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-16 w-full">
      <polyline points={pts} fill="none" stroke="#34d399" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function Progress({ back }: { back: () => void }) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    supabase
      .from("exercises")
      .select("*")
      .order("name")
      .then(({ data }) => {
        setExercises(data ?? []);
        if (data?.length) setSelected((s) => s || data[0].id);
      });
  }, []);

  useEffect(() => {
    if (!selected) return;
    supabase
      .from("set_logs")
      .select("*, workout_sessions!inner(session_date)")
      .eq("exercise_id", selected)
      .order("created_at")
      .limit(2000)
      .then(({ data }) => setRows((data ?? []) as Row[]));
  }, [selected]);

  const ex = exercises.find((e) => e.id === selected);
  const metric = ex?.metric ?? "weight_reps";

  const sprint = metric === "sprint";
  // Sprints: compare only runs over the most common distance
  const dist = sprint ? mostCommon(rows.map((r) => r.meters ?? 0)) : 0;
  const weeks = new Map<string, WeekStat>();
  for (const r of rows) {
    if (sprint && r.meters !== dist) continue;
    const d = parseDate(r.workout_sessions.session_date);
    const ws = weekStart(d);
    const key = ws.toISOString();
    const score = metric === "weight_reps" ? e1rm(r.weight, r.reps) : sprint ? Number(r.seconds ?? 0) : Number(r.weight ?? 0);
    const vol = Number(r.weight ?? 0) * (r.reps ?? r.meters ?? r.seconds ?? 0);
    const cur = weeks.get(key);
    if (!cur) weeks.set(key, { key, label: `KW ${isoWeek(d)}`, top: r, best: score, volume: vol, sets: 1 });
    else {
      cur.sets++;
      cur.volume += vol;
      if (sprint ? score < cur.best : score > cur.best) {
        cur.best = score;
        cur.top = r;
      }
    }
  }
  const list = [...weeks.values()].sort((a, b) => a.key.localeCompare(b.key));

  return (
    <div className="flex flex-col gap-3 pt-4">
      <header className="flex items-center gap-2">
        <button className="btn-ghost px-2" onClick={back}>‹</button>
        <h1 className="flex-1 text-xl font-semibold">Fortschritt</h1>
      </header>
      <select value={selected} onChange={(e) => setSelected(e.target.value)}>
        {exercises.map((e) => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </select>

      {list.length === 0 ? (
        <p className="text-sm text-slate-500">Noch keine Sätze für diese Übung.</p>
      ) : (
        <>
          <div className="card p-3">
            <p className="text-xs text-slate-400">{metric === "weight_reps" ? "Geschätztes 1RM pro Woche" : sprint ? `Beste Zeit über ${dist} m pro Woche (niedriger = besser)` : "Top-Gewicht pro Woche"}</p>
            <Sparkline values={list.map((w) => w.best)} />
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-normal">Woche</th>
                  <th className="px-2 text-left font-normal">Top-Satz</th>
                  <th className="px-2 text-right font-normal">{metric === "weight_reps" ? "e1RM" : sprint ? "Beste s" : "Max kg"}</th>
                  <th className="px-2 text-right font-normal">Sätze</th>
                  <th className="px-3 text-right font-normal">Volumen</th>
                </tr>
              </thead>
              <tbody>
                {[...list].reverse().map((w, i, arr) => {
                  const prevBest = arr[i + 1]?.best;
                  const delta = prevBest != null ? w.best - prevBest : 0;
                  return (
                    <tr key={w.key} className="border-t border-slate-800">
                      <td className="px-3 py-2">{w.label}</td>
                      <td className="px-2 font-mono text-xs">{fmtSet(w.top, metric)}</td>
                      <td className="px-2 text-right">
                        {w.best}
                        {delta !== 0 && <span className={`ml-1 text-[10px] ${delta > 0 !== sprint ? "text-emerald-400" : "text-red-400"}`}>{delta > 0 ? "▲" : "▼"}</span>}
                      </td>
                      <td className="px-2 text-right text-slate-400">{w.sets}</td>
                      <td className="px-3 text-right text-slate-400">{Math.round(w.volume)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

import { useState } from "react";
import { updateTask } from "../lib/data";
import { isoDate } from "../lib/dates";
import type { Task } from "../lib/types";
import BreathSession from "./BreathSession";
import PoemTrainer from "./PoemTrainer";
import IntervalTimer from "./IntervalTimer";

function icon(t: Task) {
  if (/pouchi/i.test(t.title) && /trick/i.test(t.title)) return "🐕";
  if (/wasserschüssel|napf/i.test(t.title)) return "🥣";
  if (t.timer?.style === "calm") return "🧘";
  if (t.timer) return "🥊";
  if (/lüft/i.test(t.title)) return "🌬️";
  return "✓";
}

/** Short button caption: drop "(10 min)" etc. and anything after a colon/ampersand. */
function label(t: Task) {
  return t.title
    .replace(/\s*\(.*\)$/, "")
    .replace(/^Wohnung /, "")
    .replace(/^Pouchi: (.*?)( abwaschen)?( &.*)?$/, "Pouchi: $1");
}

/** Today's "anytime" routines as one-tap buttons: timers start right away, the rest just gets ticked off. */
export default function QuickHabits({ tasks, patch }: { tasks: Task[]; patch: (id: string, p: Partial<Task>) => void }) {
  const [running, setRunning] = useState<Task | null>(null);
  const [breathing, setBreathing] = useState(false);
  const [poem, setPoem] = useState(false);
  const today = isoDate();
  const items = tasks.filter((t) => t.anytime && t.due_date === today);
  if (!items.length) return null;

  function complete(t: Task, minutes?: number) {
    const p: Partial<Task> = { done: true, done_at: new Date().toISOString(), actual_minutes: minutes ?? t.estimate_minutes ?? null };
    patch(t.id, p);
    void updateTask(t.id, p);
  }

  function saveProgress(t: Task, seconds: number) {
    patch(t.id, { progress_seconds: seconds });
    void updateTask(t.id, { progress_seconds: seconds });
  }

  function undo(t: Task) {
    patch(t.id, { done: false, done_at: null });
    void updateTask(t.id, { done: false, actual_minutes: null });
  }

  const doneCount = items.filter((t) => t.done).length;

  return (
    <section className="card p-2">
      <div className="mb-1.5 flex items-baseline justify-between px-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">⚡ Daily</span>
        <span className="flex items-center gap-2 text-[11px] text-slate-500">
          <button className="rounded-full bg-amber-900/50 px-2 py-0.5 text-amber-200" onClick={() => setPoem(true)}>
            📜 Gedicht
          </button>
          <button className="rounded-full bg-indigo-900/60 px-2 py-0.5 text-indigo-200" onClick={() => setBreathing(true)}>
            🫁 Atem
          </button>
          {doneCount}/{items.length}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {items.map((t) => (
          <button
            key={t.id}
            onClick={() => (t.done ? undo(t) : t.timer ? setRunning(t) : complete(t))}
            className={`flex flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-center transition ${
              t.done ? "bg-emerald-600/20 text-emerald-300" : "bg-slate-800 active:scale-95"
            }`}
          >
            <span className="text-xl">{t.done ? "✓" : icon(t)}</span>
            <span className="text-[10px] leading-tight">{label(t)}</span>
            {!t.done && (t.progress_seconds ?? 0) > 0 && t.timer && (
              <span className="text-[9px] text-amber-300">
                {Math.round((t.progress_seconds ?? 0) / 60)}/{Math.round((t.timer.rounds * t.timer.work + (t.timer.rounds - 1) * t.timer.rest) / 60)} min
              </span>
            )}
          </button>
        ))}
      </div>
      {breathing && <BreathSession onClose={() => setBreathing(false)} />}
      {poem && <PoemTrainer onClose={() => setPoem(false)} />}
      {running?.timer && (
        <IntervalTimer
          title={running.title}
          config={running.timer}
          onClose={() => setRunning(null)}
          initialSeconds={running.progress_seconds ?? 0}
          onSaveProgress={(seconds) => saveProgress(running, seconds)}
          onComplete={(minutes) => {
            complete(running, minutes);
            setRunning(null);
          }}
        />
      )}
    </section>
  );
}

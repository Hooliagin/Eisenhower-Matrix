import { useState } from "react";
import { updateTask } from "../lib/data";
import { isoDate } from "../lib/dates";
import type { Task } from "../lib/types";
import IntervalTimer from "./IntervalTimer";

function icon(t: Task) {
  if (t.timer?.style === "calm") return "🧘";
  if (t.timer) return "🥊";
  if (/lüft/i.test(t.title)) return "🌬️";
  return "✓";
}

/** Today's "anytime" routines as one-tap buttons: timers start right away, the rest just gets ticked off. */
export default function QuickHabits({ tasks, patch }: { tasks: Task[]; patch: (id: string, p: Partial<Task>) => void }) {
  const [running, setRunning] = useState<Task | null>(null);
  const today = isoDate();
  const items = tasks.filter((t) => t.anytime && t.due_date === today);
  if (!items.length) return null;

  function complete(t: Task, minutes?: number) {
    const p: Partial<Task> = { done: true, done_at: new Date().toISOString(), actual_minutes: minutes ?? t.estimate_minutes ?? null };
    patch(t.id, p);
    void updateTask(t.id, p);
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
        <span className="text-[11px] text-slate-500">
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
            <span className="text-[10px] leading-tight">{t.title.replace(/\s*\(.*\)$/, "").replace(/^Wohnung /, "")}</span>
          </button>
        ))}
      </div>
      {running?.timer && (
        <IntervalTimer
          title={running.title}
          config={running.timer}
          onClose={() => setRunning(null)}
          onComplete={(minutes) => {
            complete(running, minutes);
            setRunning(null);
          }}
        />
      )}
    </section>
  );
}

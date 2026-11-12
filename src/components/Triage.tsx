import { useState } from "react";
import { updateTask } from "../lib/data";
import { addDays, isoDate, parseDate } from "../lib/dates";
import type { Task } from "../lib/types";
import Icon from "./ui/Icon";

type Choice = { label: string; hint: string; icon: string; patch: () => Partial<Task>; tone: string };

/**
 * "Aufräumen": overdue tasks pile up and turn the day plan into a wall. One decision per task – today, tomorrow,
 * some day, or drop it – clears the wall in about a minute. Nothing is deleted: "Weglassen" moves the task to the
 * matrix's fourth quadrant, where it can be picked up again.
 */
export default function Triage({ tasks, patch, onClose }: { tasks: Task[]; patch: (id: string, p: Partial<Task>) => void; onClose: () => void }) {
  const [queue] = useState(tasks); // fixed at open, so the list does not shift under the finger
  const [i, setI] = useState(0);
  const [log, setLog] = useState<Record<string, number>>({});
  const today = isoDate();
  const t = queue[i];

  const choices: Choice[] = [
    { label: "Heute", hint: "kommt in den Tagesplan", icon: "☀️", tone: "bg-amber-400 text-slate-950", patch: () => ({ due_date: today, quadrant: "do" }) },
    { label: "Morgen", hint: "ab morgen im Plan", icon: "🌅", tone: "bg-white/10 text-slate-100", patch: () => ({ due_date: isoDate(addDays(new Date(), 1)), quadrant: "schedule" }) },
    { label: "Nächste Woche", hint: "Montag wieder da", icon: "📅", tone: "bg-white/10 text-slate-100", patch: () => ({ due_date: isoDate(addDays(new Date(), ((8 - new Date().getDay()) % 7) || 7)), quadrant: "schedule" }) },
    { label: "Irgendwann", hint: "ohne Datum einplanen", icon: "🗂️", tone: "bg-white/10 text-slate-100", patch: () => ({ due_date: null, quadrant: "schedule" }) },
    { label: "Weglassen", hint: "raus aus dem Kopf", icon: "🍃", tone: "bg-white/[0.06] text-slate-400", patch: () => ({ due_date: null, quadrant: "eliminate" }) },
  ];

  function decide(c: Choice) {
    const p = c.patch();
    patch(t.id, p);
    void updateTask(t.id, p);
    setLog((l) => ({ ...l, [c.label]: (l[c.label] ?? 0) + 1 }));
    setI(i + 1);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 px-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)", paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}>
      <header className="flex items-center gap-2">
        <button className="btn-ghost h-10 w-10 p-0" onClick={onClose} aria-label="Schließen">
          <Icon name="close" size={18} />
        </button>
        <h1 className="flex-1 text-xl">Aufräumen</h1>
        <span className="font-pixel text-sm text-slate-400">
          {Math.min(i + 1, queue.length)}/{queue.length}
        </span>
      </header>
      <div className="mt-3 flex gap-1">
        {queue.map((q, k) => (
          <span key={q.id} className={`h-1 flex-1 rounded-full ${k < i ? "bg-emerald-400" : k === i ? "bg-amber-300" : "bg-white/10"}`} />
        ))}
      </div>

      {t ? (
        <div key={t.id} className="flex flex-1 animate-rise flex-col justify-center gap-5">
          <div className="card p-5">
            <p className="label text-red-300">
              seit {Math.round((parseDate(today).getTime() - parseDate(t.due_date!).getTime()) / 86_400_000)} Tagen fällig
              {t.estimate_minutes ? ` · ${t.estimate_minutes} min` : ""}
            </p>
            <p className="mt-2 text-xl font-semibold leading-snug">{t.title}</p>
            {t.notes && <p className="mt-2 text-sm text-slate-400">{t.notes}</p>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {choices.map((c, k) => (
              <button key={c.label} onClick={() => decide(c)} className={`btn flex-col items-start gap-0 rounded-2xl px-4 py-3 text-left ${c.tone} ${k === 0 ? "col-span-2" : ""}`}>
                <span className="text-base font-semibold">
                  {c.icon} {c.label}
                </span>
                <span className="text-[11px] opacity-70">{c.hint}</span>
              </button>
            ))}
          </div>
          <button className="text-center text-xs text-slate-500" onClick={() => setI(i + 1)}>
            überspringen
          </button>
        </div>
      ) : (
        <div className="flex flex-1 animate-pop flex-col items-center justify-center gap-3 text-center">
          <span className="text-6xl">🧹</span>
          <p className="font-pixel text-2xl text-emerald-300">Aufgeräumt</p>
          <p className="text-sm text-slate-400">
            {Object.entries(log)
              .map(([k, n]) => `${n}× ${k}`)
              .join(" · ") || "Nichts verändert."}
          </p>
          <button className="btn-primary mt-4 px-8 py-3" onClick={onClose}>
            Fertig
          </button>
        </div>
      )}
    </div>
  );
}

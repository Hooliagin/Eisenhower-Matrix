import { useState } from "react";
import { updateTask } from "../lib/data";
import { ATTRS, ELEMENTS, type Attribute } from "../lib/character";
import { isoDate } from "../lib/dates";
import type { Task } from "../lib/types";
import BreathSession from "./BreathSession";
import PoemTrainer from "./PoemTrainer";
import { PouchiPanel } from "./Pouchi";
import IntervalTimer from "./IntervalTimer";
import { ask } from "./ui/Sheet";

function icon(t: Task) {
  if (/pouchi/i.test(t.title) && /trick/i.test(t.title)) return "🐕";
  if (/wasserschüssel|napf/i.test(t.title)) return "🥣";
  if (t.timer?.style === "breath") return /lampe|licht/i.test(t.title) ? "💡" : "🫁";
  if (t.timer?.style === "calm") return "🧘";
  if (/partnerin|partner/i.test(t.title)) return "💞";
  if (/tagebuch/i.test(t.title)) return "📔";
  if (t.timer) return "🥊";
  if (/lüft/i.test(t.title)) return "🌬️";
  return "✓";
}

/** Short button caption: drop "(10 min)" etc. and anything after a colon/ampersand. */
function label(t: Task) {
  return t.title
    .replace(/\s*\(.*\)$/, "")
    .replace(/^Wohnung (\d+ min )?/, "")
    .replace(/^Tageslichtlampe.*$/, "Lichtlampe")
    .replace(/^Etwas für meine Partnerin.*$/, "Für meine Partnerin")
    .replace(/^Tagebuch schreiben.*$/, "Tagebuch")
    .replace(/^Tricks mit Pouchi$/, "Pouchi-Tricks")
    .replace(/^Pouchi: (.*?)( abwaschen)?( &.*)?$/, "Pouchis $1")
    .replace(/^lüften$/, "Lüften");
}

const timerMinutes = (t: Task) => (t.timer ? Math.round((t.timer.rounds * t.timer.work + (t.timer.rounds - 1) * t.timer.rest) / 60) : 0);

/** Progress ring around the done/total count. */
function Ring({ done, total }: { done: number; total: number }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const all = total > 0 && done === total;
  return (
    <span className="relative grid h-10 w-10 place-items-center">
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" stroke="rgba(148,163,196,.16)" strokeWidth="3.5" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke={all ? "#34d399" : "#fbbf24"}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - (total ? done / total : 0))}
          style={{ transition: "stroke-dashoffset .7s cubic-bezier(.2,.8,.2,1), stroke .3s" }}
        />
      </svg>
      <span className={`font-pixel text-[11px] ${all ? "text-emerald-300" : "text-slate-200"}`}>
        {done}/{total}
      </span>
    </span>
  );
}

/** Today's "anytime" routines as one-tap buttons: timers start right away, the rest just gets ticked off. */
export default function QuickHabits({ tasks, patch }: { tasks: Task[]; patch: (id: string, p: Partial<Task>) => void }) {
  const [running, setRunning] = useState<Task | null>(null);
  const [breathTask, setBreathTask] = useState<Task | null>(null); // e.g. daylight lamp: pick an exercise, run it for the timer length
  const [breathing, setBreathing] = useState(false);
  const [poem, setPoem] = useState(false);
  const [pouchi, setPouchi] = useState(false);
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

  async function tap(t: Task) {
    if (t.done) {
      if (await ask.confirm(`„${label(t)}“ wieder als offen markieren?`, { ok: "Wieder öffnen" })) undo(t);
    } else if (t.timer?.style === "breath") setBreathTask(t);
    else if (t.timer) setRunning(t);
    else complete(t);
  }

  const doneCount = items.filter((t) => t.done).length;

  return (
    <section className="card p-3">
      <div className="mb-2.5 flex items-center gap-2.5">
        <Ring done={doneCount} total={items.length} />
        <div className="min-w-0 flex-1">
          <h2 className="text-base leading-tight">Dailies</h2>
          <p className="truncate text-[11px] text-slate-500">{doneCount === items.length ? "Alle geschafft" : `${items.length - doneCount} offen`}</p>
        </div>
        <button className="btn bg-orange-500/15 px-2.5 py-1.5 text-base" onClick={() => setPouchi(true)} aria-label="Pouchi">
          🐕
        </button>
        <button className="btn bg-amber-500/15 px-2.5 py-1.5 text-xs text-amber-200" onClick={() => setPoem(true)}>
          📜 Gedicht
        </button>
        <button className="btn bg-indigo-500/20 px-2.5 py-1.5 text-xs text-indigo-200" onClick={() => setBreathing(true)}>
          🫁 Atem
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {items.map((t) => {
          const partial = !t.done && (t.progress_seconds ?? 0) > 0 && t.timer;
          const tint = t.attribute ? ATTRS[t.attribute as Attribute]?.color : t.element ? ELEMENTS[t.element].color : "#94a3b8";
          return (
            <button
              key={t.id}
              onClick={() => void tap(t)}
              className={`relative flex min-h-[4.6rem] flex-col items-center justify-start gap-1 rounded-2xl px-1 pb-1.5 pt-2 text-center transition duration-150 active:scale-90 ${
                t.done ? "bg-emerald-500/[0.13]" : "bg-white/[0.055]"
              }`}
              style={t.done ? undefined : { boxShadow: `inset 0 -2px 0 0 ${tint}55` }}
            >
              <span className={`text-[22px] leading-none transition ${t.done ? "opacity-60 saturate-50" : ""}`}>{icon(t)}</span>
              {t.done && (
                <span className="absolute right-1.5 top-1.5 grid h-4 w-4 animate-pop place-items-center rounded-full bg-emerald-400 text-[10px] font-bold text-slate-950">✓</span>
              )}
              <span className={`text-[10px] leading-[1.15] ${t.done ? "text-emerald-200/70" : "text-slate-200"}`}>{label(t)}</span>
              {partial && (
                <span className="font-pixel text-[9px] text-amber-300">
                  {Math.round((t.progress_seconds ?? 0) / 60)}/{timerMinutes(t)} min
                </span>
              )}
            </button>
          );
        })}
      </div>
      {breathing && <BreathSession onClose={() => setBreathing(false)} />}
      {breathTask?.timer && (
        <BreathSession
          minutes={Math.round(breathTask.timer.work / 60)}
          context={`${icon(breathTask)} ${label(breathTask).replace(/:.*$/, "")}`}
          onClose={() => setBreathTask(null)}
          onSaved={(minutes) => complete(breathTask, minutes)}
        />
      )}
      {poem && <PoemTrainer onClose={() => setPoem(false)} />}
      {pouchi && <PouchiPanel onClose={() => setPouchi(false)} />}
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

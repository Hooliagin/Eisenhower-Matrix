import { useState } from "react";
import { fmtSeconds, useRestTimer } from "../lib/timer";
import PoemTrainer from "./PoemTrainer";

// Short, phone-free things for the rest between sets (one per pause, rotating).
const TIPS = [
  "3 zyklische Seufzer: 2× kurz ein, lang aus",
  "Ein paar Schlucke Wasser",
  "Nächsten Satz planen: Gewicht, Wdh., ein Technik-Punkt",
  "Locker gehen, Schultern kreisen",
  "Satz im Kopf einmal durchgehen",
];

export default function RestTimerBar() {
  const { endsAt, remaining, total, add, stop } = useRestTimer();
  const [poem, setPoem] = useState(false);
  if (!endsAt) return poem ? <PoemTrainer onClose={() => setPoem(false)} /> : null;
  const tip = TIPS[Math.floor(endsAt / 1000) % TIPS.length];
  const done = remaining === 0;
  const pct = total ? (1 - remaining / total) * 100 : 100;

  return (
    <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+3.6rem)] z-40 px-3">
      <div
        className={`mx-auto flex max-w-md items-center gap-3 overflow-hidden rounded-2xl border p-3 shadow-2xl ${
          done ? "animate-pulse border-emerald-400 bg-emerald-600" : "border-slate-700 bg-slate-900"
        }`}
        style={done ? undefined : { backgroundImage: `linear-gradient(90deg, rgba(16,185,129,.25) ${pct}%, transparent ${pct}%)` }}
      >
        <div className="flex-1">
          <div className="text-xs uppercase tracking-wide text-slate-300">{done ? "Los geht's!" : "Pause"}</div>
          <div className="font-mono text-3xl font-semibold tabular-nums">{fmtSeconds(remaining)}</div>
          {!done && <div className="truncate text-[11px] text-slate-400">{tip}</div>}
        </div>
        {!done && (
          <button className="btn bg-amber-500/90 text-slate-900" onClick={() => setPoem(true)}>
            📜
          </button>
        )}
        {!done && (
          <button className="btn-ghost" onClick={() => add(30)}>
            +30s
          </button>
        )}
        <button className="btn-ghost" onClick={stop}>
          {done ? "OK" : "Skip"}
        </button>
      </div>
      {poem && <PoemTrainer onClose={() => setPoem(false)} />}
    </div>
  );
}

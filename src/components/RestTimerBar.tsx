import { fmtSeconds, useRestTimer } from "../lib/timer";

export default function RestTimerBar() {
  const { endsAt, remaining, total, add, stop } = useRestTimer();
  if (!endsAt) return null;
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
        </div>
        {!done && (
          <button className="btn-ghost" onClick={() => add(30)}>
            +30s
          </button>
        )}
        <button className="btn-ghost" onClick={stop}>
          {done ? "OK" : "Skip"}
        </button>
      </div>
    </div>
  );
}

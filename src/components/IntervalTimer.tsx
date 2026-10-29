import { useEffect, useRef, useState } from "react";
import { stateAt, totalSeconds, type IntervalConfig } from "../lib/interval";
import { fmtSeconds } from "../lib/timer";
import { SOUNDS, unlockAudio } from "../lib/sound";

interface Props {
  title: string;
  config: IntervalConfig;
  onClose: () => void;
  /** Called with the workout length in minutes when the user saves a finished session. */
  onComplete?: (minutes: number) => void;
}

type WakeLock = { release: () => Promise<void> };

/** Full-screen round timer with boxing-style signals; time is derived from timestamps so it survives tab throttling. */
export default function IntervalTimer({ title, config, onClose, onComplete }: Props) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [pausedTotal, setPausedTotal] = useState(0);
  const [now, setNow] = useState(Date.now());
  const last = useRef<{ index: number; remaining: number }>({ index: -1, remaining: -1 });
  const wake = useRef<WakeLock | null>(null);

  const elapsed = startedAt ? ((pausedAt ?? now) - startedAt - pausedTotal) / 1000 : 0;
  const st = stateAt(config, elapsed);
  const total = totalSeconds(config);

  useEffect(() => {
    if (!startedAt || pausedAt || st.kind === "done") return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [startedAt, pausedAt, st.kind]);

  // Signals on phase changes and countdowns
  useEffect(() => {
    if (!startedAt) return;
    const prev = last.current;
    if (st.index !== prev.index) {
      if (st.kind === "work") {
        SOUNDS.roundStart();
        navigator.vibrate?.(400);
      } else if (st.kind === "rest") {
        SOUNDS.roundEnd();
        navigator.vibrate?.([200, 100, 200]);
      } else if (st.kind === "done") {
        SOUNDS.roundEnd();
        setTimeout(SOUNDS.finished, 1300);
        navigator.vibrate?.([300, 100, 300, 100, 600]);
      }
    } else if (st.remaining !== prev.remaining) {
      if (st.kind === "work" && st.remaining === 10) SOUNDS.tenSeconds();
      if ((st.kind === "rest" || st.kind === "prep") && st.remaining <= 3 && st.remaining > 0) SOUNDS.tick();
    }
    last.current = { index: st.index, remaining: st.remaining };
  }, [startedAt, st.index, st.kind, st.remaining]);

  // Keep the screen on while boxing
  useEffect(() => {
    if (!startedAt || st.kind === "done") return;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLock> } };
    nav.wakeLock?.request("screen").then((w) => (wake.current = w)).catch(() => {});
    return () => {
      void wake.current?.release().catch(() => {});
      wake.current = null;
    };
  }, [startedAt, st.kind]);

  function start() {
    unlockAudio();
    setStartedAt(Date.now());
    setNow(Date.now());
  }

  function togglePause() {
    if (pausedAt) {
      setPausedTotal((p) => p + (Date.now() - pausedAt));
      setPausedAt(null);
      setNow(Date.now());
    } else setPausedAt(Date.now());
  }

  const bg =
    st.kind === "work" ? "bg-red-950" : st.kind === "rest" ? "bg-emerald-950" : st.kind === "done" ? "bg-slate-900" : "bg-slate-950";
  const label =
    !startedAt ? "Bereit?" : st.kind === "prep" ? "Gleich geht's los" : st.kind === "work" ? `Runde ${st.round} / ${config.rounds}` : st.kind === "rest" ? `Pause – gleich Runde ${st.round}` : "Fertig! 🥊";
  const phasePct = st.phaseSeconds ? 1 - st.remaining / st.phaseSeconds : 1;

  return (
    <div className={`fixed inset-0 z-50 flex flex-col items-center justify-between p-6 pt-safe pb-safe transition-colors ${bg}`}>
      <div className="flex w-full items-center justify-between">
        <span className="text-sm text-slate-400">{title}</span>
        <button className="btn-ghost px-3" onClick={onClose}>✕</button>
      </div>

      <div className="flex flex-col items-center gap-4">
        <p className={`text-xl font-semibold ${st.kind === "work" ? "text-red-300" : st.kind === "rest" ? "text-emerald-300" : "text-slate-200"}`}>{label}</p>
        <p className="font-mono text-8xl font-bold tabular-nums">
          {!startedAt ? fmtSeconds(config.prep ?? config.work) : st.kind === "done" ? fmtSeconds(Math.round(total)) : fmtSeconds(st.remaining)}
        </p>
        <div className="flex gap-2">
          {Array.from({ length: config.rounds }, (_, i) => {
            const r = i + 1;
            const doneRound = st.kind === "done" || r < st.round;
            const active = r === st.round && st.kind === "work";
            return <span key={r} className={`h-3 w-10 rounded-full ${doneRound ? "bg-red-500" : active ? "bg-red-400/60" : "bg-slate-700"}`} />;
          })}
        </div>
        {startedAt && st.kind !== "done" && (
          <div className="h-1.5 w-64 overflow-hidden rounded-full bg-slate-800">
            <div className={`h-full ${st.kind === "work" ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${phasePct * 100}%` }} />
          </div>
        )}
        <p className="text-xs text-slate-500">
          {config.rounds} × {fmtSeconds(config.work)} · {config.rest}s Pause · gesamt {fmtSeconds(Math.round(total))}
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-2">
        {!startedAt && (
          <button className="btn-primary py-4 text-lg" onClick={start}>
            ▶ Start
          </button>
        )}
        {startedAt && st.kind !== "done" && (
          <button className="btn-ghost py-4 text-lg" onClick={togglePause}>
            {pausedAt ? "▶ Weiter" : "⏸ Pause"}
          </button>
        )}
        {st.kind === "done" && startedAt && (
          <>
            {onComplete && (
              <button className="btn-primary py-4 text-lg" onClick={() => onComplete(Math.ceil(total / 60))}>
                ✓ Als erledigt speichern
              </button>
            )}
            <button className="btn-ghost py-3" onClick={onClose}>Schließen</button>
          </>
        )}
        <p className="text-center text-[11px] text-slate-500">
          Signale: langer Ton = Runde startet · Glocke = Runde vorbei · zwei Klicks = noch 10 Sekunden · Ticken = Pause endet
        </p>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { stateAt, totalSeconds, type IntervalConfig } from "../lib/interval";
import { fmtSeconds } from "../lib/timer";
import { breathSound, SOUNDS, startNoise, unlockAudio, type NoiseKind } from "../lib/sound";
import { RESONANCE } from "../lib/breath";
import BreathCircle from "./BreathCircle";

interface Props {
  title: string;
  config: IntervalConfig;
  onClose: () => void;
  /** Called with the workout length in minutes when the user saves a finished session. */
  onComplete?: (minutes: number) => void;
  /** Seconds already done in an earlier, interrupted session (counted after the prep countdown). */
  initialSeconds?: number;
  /** Save progress to continue later; called with seconds done (after prep). */
  onSaveProgress?: (seconds: number) => void;
}

type WakeLock = { release: () => Promise<void> };

/** Full-screen round timer with boxing-style signals; time is derived from timestamps so it survives tab throttling. */
export default function IntervalTimer({ title, config, onClose, onComplete, initialSeconds = 0, onSaveProgress }: Props) {
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
  const calm = config.style === "calm";
  const plain = config.style === "plain";

  // Background noise for meditation; choice and volume remembered on this device.
  const [noise, setNoise] = useState<NoiseKind | "off">(() => {
    try {
      return (localStorage.getItem("noise-kind") as NoiseKind | "off" | null) ?? "brown";
    } catch {
      return "brown";
    }
  });
  const [noiseVol, setNoiseVol] = useState(() => {
    try {
      return Number(localStorage.getItem("noise-volume") ?? "0.35");
    } catch {
      return 0.35;
    }
  });
  const noiseRef = useRef<ReturnType<typeof startNoise> | null>(null);

  // Breath guide for meditation: resonance pace (5.5 s in / 5.5 s out) with a soft breath sound.
  const [guide, setGuide] = useState(() => {
    try {
      return localStorage.getItem("breath-guide") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("breath-guide", guide ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }, [guide]);
  const cycle = RESONANCE.in + RESONANCE.out;
  const workElapsed = Math.max(0, elapsed - (config.prep ?? 0));
  const guideOn = calm && guide && !!startedAt && !pausedAt && st.kind === "work";
  const guideStep = Math.floor(workElapsed / (cycle / 2)); // counts half-cycles
  const guideKind = workElapsed % cycle < RESONANCE.in ? "in" : "out";
  useEffect(() => {
    if (guideOn) breathSound(guideKind, guideKind === "in" ? RESONANCE.in : RESONANCE.out, 0.08);
  }, [guideOn, guideStep]); // a new half-cycle starts

  // Dark mode: black screen while running (screen stays technically on so sound keeps playing); tap reveals controls.
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem("timer-dark") === "1";
    } catch {
      return false;
    }
  });
  const [revealedAt, setRevealedAt] = useState(0);
  useEffect(() => {
    try {
      localStorage.setItem("timer-dark", dark ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }, [dark]);
  const noiseOn = calm && noise !== "off" && !!startedAt && !pausedAt && st.kind === "work";

  useEffect(() => {
    try {
      localStorage.setItem("noise-kind", noise);
      localStorage.setItem("noise-volume", String(noiseVol));
    } catch {
      /* storage unavailable */
    }
  }, [noise, noiseVol]);

  useEffect(() => {
    if (!noiseOn) return;
    const n = startNoise(noise, noiseVol);
    noiseRef.current = n;
    return () => {
      n.stop();
      noiseRef.current = null;
    };
    // volume changes are applied live below, without restarting the noise
  }, [noiseOn, noise]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => noiseRef.current?.setVolume(noiseVol), [noiseVol]);

  useEffect(() => {
    if (!startedAt) return;
    const prev = last.current;
    if (plain) {
      if (st.index !== prev.index && st.kind === "work") SOUNDS.roundStart();
      else if (st.index !== prev.index && st.kind === "done") {
        SOUNDS.finished();
        navigator.vibrate?.([300, 100, 300]);
      } else if (st.remaining !== prev.remaining && st.kind === "prep" && st.remaining <= 3) SOUNDS.softTick();
      last.current = { index: st.index, remaining: st.remaining };
      return;
    }
    if (calm) {
      if (st.index !== prev.index && (st.kind === "work" || st.kind === "done")) {
        SOUNDS.gong();
        navigator.vibrate?.(300);
      } else if (st.remaining !== prev.remaining && st.kind === "prep" && st.remaining <= 3) SOUNDS.softTick();
      last.current = { index: st.index, remaining: st.remaining };
      return;
    }
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
  }, [startedAt, st.index, st.kind, st.remaining, calm]);

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

  const prep = config.prep ?? 0;
  const resuming = initialSeconds > 0;

  function start() {
    unlockAudio();
    // Resuming skips the prep countdown and starts where the last session stopped.
    const offset = resuming ? (prep + initialSeconds) * 1000 : 0;
    setStartedAt(Date.now() - offset);
    setNow(Date.now());
  }

  /** Seconds of actual work done so far (prep excluded). */
  const doneSeconds = Math.max(0, Math.floor(elapsed - prep));

  function saveForLater() {
    onSaveProgress?.(doneSeconds);
    onClose();
  }

  function close() {
    // Leaving a running session keeps what was done instead of throwing it away.
    if (startedAt && st.kind !== "done" && doneSeconds >= 30 && onSaveProgress) onSaveProgress(doneSeconds);
    onClose();
  }

  function togglePause() {
    if (pausedAt) {
      setPausedTotal((p) => p + (Date.now() - pausedAt));
      setPausedAt(null);
      setNow(Date.now());
    } else setPausedAt(Date.now());
  }

  const running = !!startedAt && !pausedAt && st.kind !== "done";
  const blackout = dark && running && now - revealedAt > 6000;

  const bg = plain
    ? "bg-teal-950"
    : calm
    ? "bg-indigo-950"
    : st.kind === "work" ? "bg-red-950" : st.kind === "rest" ? "bg-emerald-950" : st.kind === "done" ? "bg-slate-900" : "bg-slate-950";
  const label = plain
    ? !startedAt ? "Bereit?" : st.kind === "prep" ? "Gleich geht's los" : st.kind === "work" ? (pausedAt ? "Pausiert" : "Läuft") : "Fertig! 🎉"
    : calm
    ? !startedAt ? "Bereit?" : st.kind === "prep" ? "Ankommen …" : st.kind === "work" ? "Atmen 🧘" : "Fertig 🧘"
    : !startedAt ? "Bereit?" : st.kind === "prep" ? "Gleich geht's los" : st.kind === "work" ? `Runde ${st.round} / ${config.rounds}` : st.kind === "rest" ? `Pause – gleich Runde ${st.round}` : "Fertig! 🥊";
  const phasePct = st.phaseSeconds ? 1 - st.remaining / st.phaseSeconds : 1;

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-between px-6 transition-colors ${bg}`}
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 1rem)", paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
    >
      {blackout && (
        <button
          aria-label="Bedienung anzeigen"
          className="fixed inset-0 z-[60] bg-black"
          onClick={() => setRevealedAt(Date.now())}
        >
          {now - (startedAt ?? 0) < 4000 && <span className="text-xs text-white/20">Tippen zum Anzeigen</span>}
        </button>
      )}
      <div className="flex w-full items-center justify-between">
        <span className="text-sm text-slate-400">{title}</span>
        <button className="btn-ghost h-11 w-11 text-lg" onClick={close} aria-label="Timer schließen">
          ✕
        </button>
      </div>

      <div className="flex flex-col items-center gap-4">
        <p className={`text-xl font-semibold ${plain ? "text-teal-200" : calm ? "text-indigo-200" : st.kind === "work" ? "text-red-300" : st.kind === "rest" ? "text-emerald-300" : "text-slate-200"}`}>{label}</p>
        {!startedAt && resuming && <p className="text-sm text-slate-300">Weiter bei {fmtSeconds(initialSeconds)} – noch {fmtSeconds(Math.max(0, Math.round(total - prep - initialSeconds)))}</p>}
        {guideOn && (
          <div className="flex flex-col items-center gap-1">
            <BreathCircle kind={guideKind} seconds={guideKind === "in" ? RESONANCE.in : RESONANCE.out} stepKey={guideStep} size={170} />
            <span className="text-sm text-indigo-200">{guideKind === "in" ? "Einatmen" : "Ausatmen"}</span>
          </div>
        )}
        <p className={`font-mono font-bold tabular-nums ${guideOn ? "text-5xl" : "text-8xl"}`}>
          {!startedAt ? (resuming ? fmtSeconds(stateAt(config, prep + initialSeconds).remaining) : fmtSeconds(config.prep ?? config.work)) : st.kind === "done" ? fmtSeconds(Math.round(total)) : fmtSeconds(st.remaining)}
        </p>
        <div className={`flex gap-2 ${config.rounds < 2 ? "hidden" : ""}`}>
          {Array.from({ length: config.rounds }, (_, i) => {
            const r = i + 1;
            const doneRound = st.kind === "done" || r < st.round;
            const active = r === st.round && st.kind === "work";
            return <span key={r} className={`h-3 w-10 rounded-full ${doneRound ? "bg-red-500" : active ? "bg-red-400/60" : "bg-slate-700"}`} />;
          })}
        </div>
        {startedAt && st.kind !== "done" && (
          <div className="h-1.5 w-64 overflow-hidden rounded-full bg-slate-800">
            <div className={`h-full ${plain ? "bg-teal-400" : calm ? "bg-indigo-400" : st.kind === "work" ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${phasePct * 100}%` }} />
          </div>
        )}
        {calm && (
          <div className="flex flex-col items-center gap-2">
            <div className="flex flex-wrap justify-center gap-1">
              {(
                [
                  ["off", "Stille"],
                  ["white", "Weiß"],
                  ["pink", "Rosa"],
                  ["brown", "Braun"],
                  ["rain", "Regen"],
                  ["drone", "Brummen"],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => {
                    unlockAudio();
                    setNoise(k);
                  }}
                  className={`rounded-full px-3 py-1 text-xs ${noise === k ? "bg-indigo-300 text-indigo-950" : "bg-indigo-900/60 text-indigo-200"}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <button
              className={`rounded-full px-3 py-1 text-xs ${guide ? "bg-indigo-300 text-indigo-950" : "bg-indigo-900/60 text-indigo-200"}`}
              onClick={() => {
                unlockAudio();
                setGuide(!guide);
              }}
            >
              🫁 Atem-Guide 5,5/min {guide ? "an" : "aus"}
            </button>
            {noise !== "off" && (
              <label className="flex items-center gap-2 text-[11px] text-indigo-300">
                🔈
                <input type="range" min={0.05} max={1} step={0.05} value={noiseVol} onChange={(e) => setNoiseVol(Number(e.target.value))} className="w-40 accent-indigo-300" />
                🔊
              </label>
            )}
            <p className="text-[10px] text-indigo-300/70">Rauschen läuft während der Meditation · iPhone: Stummschalter aus</p>
          </div>
        )}
        <p className="text-xs text-slate-500">
          {config.rounds > 1 ? `${config.rounds} × ${fmtSeconds(config.work)} · ${config.rest}s Pause · ` : ""}gesamt {fmtSeconds(Math.round(total))}
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-2">
        {!startedAt && (
          <button className="btn-primary py-4 text-lg" onClick={start}>
            {resuming ? "▶ Weitermachen" : "▶ Start"}
          </button>
        )}
        <button
          className={`self-center rounded-full px-3 py-1 text-xs ${dark ? "bg-slate-200 text-slate-900" : "bg-slate-800 text-slate-300"}`}
          onClick={() => setDark(!dark)}
        >
          🌑 Bildschirm dunkel {dark ? "an" : "aus"}
        </button>
        {startedAt && st.kind !== "done" && (
          <>
            <button className="btn-ghost py-4 text-lg" onClick={togglePause}>
              {pausedAt ? "▶ Weiter" : "⏸ Pause"}
            </button>
            {onSaveProgress ? (
              <button className="btn-ghost py-3 text-sm" onClick={saveForLater}>
                💾 Beenden & später weitermachen ({fmtSeconds(doneSeconds)})
              </button>
            ) : (
              <button className="btn-ghost py-3 text-sm" onClick={close}>
                Beenden
              </button>
            )}
          </>
        )}
        {st.kind === "done" && startedAt && (
          <>
            {onComplete && (
              <button className="btn-primary py-4 text-lg" onClick={() => onComplete(Math.max(1, Math.round((total - (config.prep ?? 0)) / 60)))}>
                ✓ Als erledigt speichern
              </button>
            )}
            <button className="btn-ghost py-3" onClick={onClose}>Schließen</button>
          </>
        )}
        <p className={`text-center text-[11px] text-slate-500 ${calm || plain ? "hidden" : ""}`}>
          Signale: langer Ton = Runde startet · Glocke = Runde vorbei · zwei Klicks = noch 10 Sekunden · Ticken = Pause endet
        </p>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { EXERCISES, type BreathExercise, type BreathStep } from "../lib/breath";
import { breathSound, SOUNDS, unlockAudio } from "../lib/sound";
import { isoDate } from "../lib/dates";
import { supabase } from "../lib/supabase";
import { fmtSeconds } from "../lib/timer";
import BreathCircle from "./BreathCircle";

type WakeLock = { release: () => Promise<void> };

/** Picker + guided run of a breathing exercise; finished sessions are logged as a done task (Spiritualität / Wasser). */
export default function BreathSession({ onClose }: { onClose: () => void }) {
  const [ex, setEx] = useState<BreathExercise | null>(null);
  const [steps, setSteps] = useState<BreathStep[]>([]);
  const [idx, setIdx] = useState(-1);
  const [stepStart, setStepStart] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [sound, setSound] = useState(true);
  const [holds, setHolds] = useState<number[]>([]);
  const [saved, setSaved] = useState(false);
  const wake = useRef<WakeLock | null>(null);

  const step = steps[idx];
  const done = idx >= steps.length && steps.length > 0;
  const running = idx >= 0 && !done;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLock> } };
    nav.wakeLock?.request("screen").then((w) => (wake.current = w)).catch(() => {});
    return () => {
      clearInterval(id);
      void wake.current?.release().catch(() => {});
    };
  }, [running]);

  // Advance timed steps
  useEffect(() => {
    if (!running || !step) return;
    if (now - stepStart >= step.seconds * 1000) next();
  });

  // Sound cue at each step start
  useEffect(() => {
    if (!step) return;
    if (sound && (step.kind === "in" || step.kind === "out")) breathSound(step.kind, step.seconds, step.seconds < 1 ? 0.18 : 0.25);
    if (step.kind === "hold" && step.seconds >= 3) SOUNDS.softTick();
  }, [idx]);

  useEffect(() => {
    if (done) SOUNDS.gong();
  }, [done]);

  function begin(e: BreathExercise) {
    unlockAudio();
    const s = e.steps();
    setEx(e);
    setSteps(s);
    setHolds([]);
    setSaved(false);
    const t = Date.now();
    setStartedAt(t);
    setStepStart(t);
    setNow(t);
    setIdx(0);
  }

  function next() {
    const t = Date.now();
    if (step?.open) setHolds((h) => [...h, Math.round((t - stepStart) / 1000)]);
    setStepStart(t);
    setIdx((i) => i + 1);
  }

  async function save() {
    if (!ex) return;
    const minutes = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
    const now = new Date().toISOString();
    const { error } = await supabase.from("tasks").insert({
      title: `Atemübung: ${ex.name}`,
      quadrant: "do",
      due_date: isoDate(),
      done: true,
      done_at: now,
      actual_minutes: minutes,
      attribute: "spirit",
      element: "wasser",
      notes: holds.length ? `Luft angehalten: ${holds.map((h) => fmtSeconds(h)).join(" · ")}` : null,
      source: "app",
    });
    if (!error) setSaved(true);
  }

  // ---------- Picker ----------
  if (!ex)
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950 px-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 1rem)", paddingBottom: "2rem" }}>
        <div className="mx-auto flex max-w-md flex-col gap-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">🫁 Atemübungen</h1>
            <button className="btn-ghost h-11 w-11 text-lg" onClick={onClose} aria-label="Schließen">✕</button>
          </div>
          {EXERCISES.map((e) => (
            <button key={e.id} onClick={() => begin(e)} className="card flex flex-col gap-1 p-3 text-left active:scale-[0.99]">
              <span className="font-semibold">
                {e.emoji} {e.name} <span className="text-xs font-normal text-slate-400">· {e.goal}</span>
              </span>
              <span className="text-xs text-slate-400">{e.how}</span>
              {e.warning && <span className="text-[11px] text-amber-300/80">⚠️ {e.warning}</span>}
            </button>
          ))}
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} /> Atemgeräusche abspielen
          </label>
        </div>
      </div>
    );

  // ---------- Running / done ----------
  const elapsedStep = (now - stepStart) / 1000;
  const remaining = step ? Math.max(0, Math.ceil(step.seconds - elapsedStep)) : 0;
  const total = Math.round((now - startedAt) / 1000);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-slate-950 px-6"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 1rem)", paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
      onClick={() => step?.open && next()}
    >
      <div className="flex w-full items-center justify-between">
        <span className="text-sm text-slate-400">
          {ex.emoji} {ex.name}
        </span>
        <button className="btn-ghost h-11 w-11 text-lg" onClick={(e) => (e.stopPropagation(), onClose())} aria-label="Schließen">✕</button>
      </div>

      {done ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-2xl font-semibold">Geschafft 🙏</p>
          <p className="text-sm text-slate-400">{fmtSeconds(total)} Minuten</p>
          {holds.length > 0 && <p className="text-sm text-indigo-200">Luft angehalten: {holds.map((h) => fmtSeconds(h)).join(" · ")}</p>}
        </div>
      ) : (
        step && (
          <div className="flex flex-col items-center gap-5">
            <div className="text-xs text-slate-500">
              {step.round && `Runde ${step.round}/${step.rounds}`}
              {step.round && step.breath && " · "}
              {step.breath && `${step.round ? "Atemzug" : "Zyklus"} ${step.breath}/${step.breaths}`}
            </div>
            <BreathCircle kind={step.kind} seconds={step.seconds} stepKey={idx} color={ex.id === "fire" ? "#fb923c" : ex.id === "wimhof" ? "#7dd3fc" : "#a5b4fc"} />
            <p className="text-center text-2xl font-semibold">{step.label}</p>
            <p className="font-mono text-4xl tabular-nums text-slate-300">
              {step.open ? fmtSeconds(Math.floor(elapsedStep)) : step.seconds >= 2 ? remaining : ""}
            </p>
            {step.open && (
              <button className="btn-primary px-6 py-4 text-lg" onClick={(e) => (e.stopPropagation(), next())}>
                Einatmen →
              </button>
            )}
          </div>
        )
      )}

      <div className="flex w-full max-w-sm flex-col gap-2">
        {done ? (
          <>
            {!saved ? (
              <button className="btn-primary py-4 text-lg" onClick={save}>
                ✓ Speichern (zählt für 🕊️ Spiritualität)
              </button>
            ) : (
              <p className="text-center text-sm text-emerald-400">Gespeichert ✓</p>
            )}
            <button className="btn-ghost py-3" onClick={() => setEx(null)}>Andere Übung</button>
          </>
        ) : (
          <>
            {ex.warning && <p className="text-center text-[11px] text-amber-300/70">⚠️ {ex.warning}</p>}
            <button className="btn-ghost py-3 text-sm" onClick={(e) => (e.stopPropagation(), setIdx(steps.length))}>
              Beenden
            </button>
          </>
        )}
      </div>
    </div>
  );
}

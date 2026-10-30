import { useEffect, useRef, useState } from "react";
import { EXERCISES, stepsFor, type BreathExercise, type BreathStep } from "../lib/breath";
import { breathSound, SOUNDS, unlockAudio } from "../lib/sound";
import { isoDate } from "../lib/dates";
import { supabase } from "../lib/supabase";
import { fmtSeconds } from "../lib/timer";
import BreathCircle from "./BreathCircle";
import { BreathSensor, listenMotion, requestMotionPermission } from "../lib/breathSensor";

type WakeLock = { release: () => Promise<void> };

/** Picker + guided run of a breathing exercise; finished sessions are logged as a done task (Spiritualität / Wasser).
 *  With `minutes` (e.g. the daylight lamp) every exercise runs that long and `onSaved` gets the real duration. */
export default function BreathSession({
  onClose,
  minutes: fixedMinutes,
  context,
  onSaved,
}: {
  onClose: () => void;
  minutes?: number;
  context?: string;
  onSaved?: (minutes: number) => void;
}) {
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
  // Motion sensor: phone lying on the belly
  const [sensorOn, setSensorOn] = useState(() => {
    try {
      return localStorage.getItem("breath-sensor") === "1";
    } catch {
      return false;
    }
  });
  const [sensorMsg, setSensorMsg] = useState<string | null>(null);
  const sensor = useRef<BreathSensor | null>(null);
  const [autoNote, setAutoNote] = useState<string | null>(null);
  const rates = useRef<number[]>([]); // sensor-measured breaths/min, sampled every second
  const [history, setHistory] = useState<PastSession[]>([]);

  useEffect(() => {
    supabase
      .from("breath_sessions")
      .select("exercise, day, holds, avg_rate")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => setHistory((data ?? []) as PastSession[]));
  }, [saved]);

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

  async function toggleSensor() {
    if (sensorOn) {
      setSensorOn(false);
      setSensorMsg(null);
    } else {
      const p = await requestMotionPermission();
      if (p === "granted") {
        setSensorOn(true);
        setSensorMsg(null);
      } else setSensorMsg(p === "denied" ? "Zugriff auf Bewegungssensoren wurde abgelehnt (iPhone: Einstellungen → Safari → Bewegung & Ausrichtung)." : "Dieses Gerät hat keinen Bewegungssensor.");
    }
  }

  useEffect(() => {
    try {
      localStorage.setItem("breath-sensor", sensorOn ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }, [sensorOn]);

  // Listen to the sensor while an exercise runs
  useEffect(() => {
    if (!sensorOn || !running) return;
    const s = new BreathSensor();
    sensor.current = s;
    const off = listenMotion(s);
    return () => {
      off();
      sensor.current = null;
    };
  }, [sensorOn, running]);

  // Sample the measured pace (not during holds) for the session log
  useEffect(() => {
    if (!running || step?.kind === "hold" || !sensor.current) return;
    const r = sensor.current.rate(now);
    if (r != null && Math.floor(now / 1000) !== Math.floor((now - 100) / 1000)) rates.current.push(r);
  }, [now]);

  // Open breath holds: arm hold detection, then continue automatically once breathing is felt again
  useEffect(() => {
    if (!step?.open) return sensor.current?.stopHold();
    sensor.current?.startHold(Date.now());
  }, [idx]);
  useEffect(() => {
    if (step?.open && sensor.current && now - stepStart > 5000 && sensor.current.breathingResumed()) {
      setAutoNote("Atmung erkannt ✓");
      setTimeout(() => setAutoNote(null), 2500);
      next();
    }
  });

  function begin(e: BreathExercise) {
    unlockAudio();
    const s = stepsFor(e, fixedMinutes);
    setEx(e);
    setSteps(s);
    setHolds([]);
    setSaved(false);
    rates.current = [];
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
    const { data: task, error } = await supabase.from("tasks").insert({
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
    }).select("id").single();
    if (error) return;
    const r = rates.current;
    await supabase.from("breath_sessions").insert({
      day: isoDate(),
      exercise: ex.id,
      name: ex.name,
      duration_s: Math.round((Date.now() - startedAt) / 1000),
      holds,
      avg_rate: r.length ? Math.round((r.reduce((a, b) => a + b, 0) / r.length) * 10) / 10 : null,
      task_id: task.id,
    });
    onSaved?.(minutes);
    setSaved(true);
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
          {context && (
            <p className="rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-200">
              {context} · wähle eine Übung, sie läuft {fixedMinutes} min
            </p>
          )}
          {EXERCISES.map((e) => (
            <button key={e.id} onClick={() => begin(e)} className="card flex flex-col gap-1 p-3 text-left active:scale-[0.99]">
              <span className="font-semibold">
                {e.emoji} {e.name} <span className="text-xs font-normal text-slate-400">· {e.goal}</span>
              </span>
              <span className="text-xs text-slate-400">{fixedMinutes ? e.how.replace(/ · \d+ min/, ` · ${fixedMinutes} min`) : e.how}</span>
              {e.warning && <span className="text-[11px] text-amber-300/80">⚠️ {e.warning}</span>}
              <PastStats past={history.filter((h) => h.exercise === e.id)} />
            </button>
          ))}
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} /> Atemgeräusche abspielen
          </label>
          <button
            onClick={toggleSensor}
            className={`card flex flex-col gap-0.5 p-3 text-left ${sensorOn ? "border-emerald-600 bg-emerald-950/30" : ""}`}
          >
            <span className="text-sm font-medium">📱 Atem über das Handy erkennen {sensorOn ? "– an" : "– aus"}</span>
            <span className="text-[11px] text-slate-400">
              Handy flach auf den Bauch legen (Display nach oben), Ton über Kopfhörer. Zeigt dein Atemtempo und geht nach dem
              Luftanhalten automatisch weiter, sobald du wieder einatmest.
            </span>
          </button>
          {sensorMsg && <p className="text-xs text-amber-300">{sensorMsg}</p>}
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

      {autoNote && <div className="fixed left-1/2 top-24 -translate-x-1/2 rounded-full bg-emerald-600 px-4 py-1.5 text-sm">{autoNote}</div>}
      {done ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-2xl font-semibold">Geschafft 🙏</p>
          <p className="text-sm text-slate-400">{fmtSeconds(total)} Minuten</p>
          {holds.length > 0 && <p className="text-sm text-indigo-200">Luft angehalten: {holds.map((h) => fmtSeconds(h)).join(" · ")}</p>}
          {holds.length > 0 && <HoldVerdict holds={holds} past={history.filter((h) => h.exercise === ex.id && !(saved && h === history[0]))} />}
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
            {sensorOn && <SensorReadout sensor={sensor.current} now={now} target={ex.targetRate} holding={!!step.open} />}
          </div>
        )
      )}

      <div className="flex w-full max-w-sm flex-col gap-2">
        {done ? (
          <>
            {!saved ? (
              <button className="btn-primary py-4 text-lg" onClick={save}>
                ✓ Speichern{context ? ` (${context.replace(/^\S+ /, "")} + Atemübung)` : " (zählt für 🕊️ Spiritualität)"}
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

/** Live breathing curve from the motion sensor plus measured vs. target pace. */
function SensorReadout({ sensor, now, target, holding }: { sensor: BreathSensor | null; now: number; target?: number; holding: boolean }) {
  if (!sensor) return null;
  const pts = sensor.history.filter(([t]) => now - t < 20_000);
  const rate = sensor.rate(now);
  if (pts.length < 10) return <p className="text-xs text-slate-500">📱 Sensor startet … Handy ruhig auf den Bauch legen</p>;
  const vals = pts.map(([, v]) => v);
  const max = Math.max(...vals.map(Math.abs), 1e-4);
  const path = pts.map(([t, v]) => `${((t - (now - 20_000)) / 20_000) * 200},${20 - (v / max) * 18}`).join(" ");
  const inRange = rate != null && target != null && Math.abs(rate - target) <= Math.max(1, target * 0.2);
  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 200 40" className="h-10 w-52">
        <polyline points={path} fill="none" stroke="#34d399" strokeWidth="1.5" />
      </svg>
      <p className="text-xs text-slate-400">
        {holding
          ? "📱 Wartet auf deinen nächsten Atemzug …"
          : rate == null
            ? "📱 Messe dein Atemtempo …"
            : (
              <>
                📱 Dein Tempo <b className={inRange ? "text-emerald-400" : "text-amber-300"}>{rate.toFixed(1).replace(".", ",")}/min</b>
                {target && <> · Ziel {String(target).replace(".", ",")}/min {inRange ? "✓" : ""}</>}
              </>
            )}
      </p>
    </div>
  );
}

interface PastSession {
  exercise: string;
  day: string;
  holds: number[];
  avg_rate: number | null;
}

const maxHold = (p: PastSession) => (p.holds.length ? Math.max(...p.holds) : 0);

/** Under each exercise in the picker: how often, and for Wim Hof best / average hold. */
function PastStats({ past }: { past: PastSession[] }) {
  if (!past.length) return null;
  const withHolds = past.filter((p) => p.holds.length);
  const recent = withHolds.slice(0, 5).map(maxHold);
  return (
    <span className="text-[11px] text-indigo-300/80">
      {past.length}× gemacht
      {withHolds.length > 0 && (
        <>
          {" · "}🏆 Bestwert {fmtSeconds(Math.max(...withHolds.map(maxHold)))} · Ø letzte {recent.length}:{" "}
          {fmtSeconds(Math.round(recent.reduce((a, b) => a + b, 0) / recent.length))}
        </>
      )}
      {past[0].avg_rate != null && ` · zuletzt ${String(past[0].avg_rate).replace(".", ",")}/min`}
    </span>
  );
}

/** End screen: compare today's longest hold with the personal best and recent average. */
function HoldVerdict({ holds, past }: { holds: number[]; past: PastSession[] }) {
  const best = Math.max(...holds);
  const prev = past.filter((p) => p.holds.length).map(maxHold);
  if (!prev.length) return <p className="text-xs text-slate-400">Erster gemessener Durchgang: ab jetzt siehst du hier deinen Fortschritt.</p>;
  const record = Math.max(...prev);
  const recent = prev.slice(0, 5);
  const avg = Math.round(recent.reduce((a, b) => a + b, 0) / recent.length);
  if (best > record)
    return <p className="text-base font-semibold text-amber-300">🏆 Neuer Rekord! {fmtSeconds(best)} (bisher {fmtSeconds(record)})</p>;
  return (
    <p className={`text-sm ${best > avg ? "text-emerald-400" : "text-slate-400"}`}>
      Längstes Halten {fmtSeconds(best)} · Ø letzte {recent.length}: {fmtSeconds(avg)}
      {best > avg ? ` · +${best - avg} s besser als sonst` : ""} · Rekord {fmtSeconds(record)}
    </p>
  );
}

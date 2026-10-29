import { useEffect, useRef, useState } from "react";
import { requestMotionPermission } from "../../lib/breathSensor";
import { SOUNDS, tones, unlockAudio } from "../../lib/sound";
import { fmtSprint, GpsRun, MotionStart, type Fix } from "../../lib/sprint";

type WakeLock = { release: () => Promise<void> };
type StartMode = "signal" | "motion";
type Phase =
  | { kind: "setup" }
  | { kind: "set" } // "Auf die Plätze … Fertig": hold still, sensor learns the stillness
  | { kind: "armed"; gunAt: number | null } // waiting for the gun (signal) or the first step (motion)
  | { kind: "running"; t0: number; gunAt: number | null }
  | { kind: "result"; seconds: number; reaction: number | null; by: "gps" | "tap"; gpsDist: number; top: number }
  | { kind: "false-start" };

const DISTANCES = [30, 40, 60, 100];

function say(text: string) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "de-DE";
    u.rate = 1.05;
    speechSynthesis.speak(u);
  } catch {
    /* no speech: tones only */
  }
}

/**
 * Fullscreen sprint timer. Start by start signal (beep after a random delay; reaction time from the motion sensor) or by
 * the first movement. Stop by tapping the screen or automatically via GPS at the target distance.
 */
export default function SprintTimer({
  distance: initialDistance,
  onRun,
  onClose,
}: {
  distance: number;
  onRun: (seconds: number, meters: number) => Promise<void> | void;
  onClose: () => void;
}) {
  const [distance, setDistance] = useState(initialDistance || 60);
  const [mode, setMode] = useState<StartMode>(() => (localStorage.getItem("sprint-mode") as StartMode) || "signal");
  const [useGps, setUseGps] = useState(() => localStorage.getItem("sprint-gps") !== "0");
  const [phase, setPhase] = useState<Phase>({ kind: "setup" });
  const [now, setNow] = useState(performance.now());
  const [gpsAcc, setGpsAcc] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [motionOk, setMotionOk] = useState(true);
  const [runs, setRuns] = useState<number[]>([]);
  const [restUntil, setRestUntil] = useState<number | null>(null);

  const motion = useRef<MotionStart | null>(null);
  const gps = useRef<GpsRun | null>(null);
  const lastFix = useRef<Fix | null>(null); // seeds the start position (a still phone may not report new fixes)
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;
  const timers = useRef<number[]>([]);
  const wake = useRef<WakeLock | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem("sprint-mode", mode);
      localStorage.setItem("sprint-gps", useGps ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }, [mode, useGps]);

  // Clock for the big display
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setNow(performance.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLock> } };
    nav.wakeLock?.request("screen").then((w) => (wake.current = w)).catch(() => {});
    return () => {
      cancelAnimationFrame(raf);
      timers.current.forEach(clearTimeout);
      void wake.current?.release().catch(() => {});
    };
  }, []);

  // GPS: warm up from the setup screen on, so a good fix is ready at the start
  useEffect(() => {
    if (!useGps || !("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setGpsError(null);
        setGpsAcc(p.coords.accuracy);
        // Map the fix time onto the performance clock used for the timer (ignore implausible device timestamps).
        const age = Date.now() - p.timestamp;
        const t = performance.now() - (age >= 0 && age < 3000 ? age : 0);
        const fix: Fix = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, t, speed: p.coords.speed };
        lastFix.current = fix;
        const g = gps.current;
        const ph = phaseRef.current;
        if (!g) return;
        if (ph.kind === "running") {
          const fin = g.addFix(fix);
          if (fin != null) finish(fin, "gps");
        } else g.addStartFix(fix);
      },
      (e) => setGpsError(e.code === e.PERMISSION_DENIED ? "Standort-Zugriff abgelehnt" : "Kein GPS-Signal"),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [useGps]);

  // Motion sensor
  useEffect(() => {
    const on = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (a?.x == null || a.y == null || a.z == null || !motion.current) return;
      const mag = Math.hypot(a.x, a.y, a.z);
      const t = performance.now();
      const ph = phaseRef.current;
      if (ph.kind === "set") motion.current.push(mag, t, true);
      else if (ph.kind === "armed") {
        if (ph.gunAt == null) {
          if (mode === "signal" && motion.current.moved(mag)) falseStart();
          else if (mode === "motion") {
            const s = motion.current.push(mag, t, false);
            if (s != null) begin(s, null);
          }
        }
      } else if (ph.kind === "running" && ph.gunAt != null) motion.current.push(mag, t, false); // reaction time
    };
    window.addEventListener("devicemotion", on);
    return () => window.removeEventListener("devicemotion", on);
  }, [mode]);

  function later(ms: number, fn: () => void) {
    timers.current.push(window.setTimeout(fn, ms));
  }

  async function ready() {
    unlockAudio();
    const ok = (await requestMotionPermission()) === "granted";
    setMotionOk(ok);
    if (mode === "motion" && !ok) return;
    motion.current = new MotionStart();
    gps.current = useGps ? new GpsRun(distance) : null;
    if (gps.current && lastFix.current) gps.current.addStartFix(lastFix.current);
    setRestUntil(null);
    setPhase({ kind: "set" });
    say("Auf die Plätze");
    later(2500, () => {
      say("Fertig");
      SOUNDS.tick();
      later(1500, () => {
        if (mode === "motion") {
          setPhase({ kind: "armed", gunAt: null });
          return;
        }
        setPhase({ kind: "armed", gunAt: null });
        later(1000 + Math.random() * 2000, () => {
          if (phaseRef.current.kind !== "armed") return;
          const gun = performance.now();
          tones([[1400, 0, 0.35]], 0.6);
          begin(gun, gun);
        });
      });
    });
  }

  function begin(t0: number, gunAt: number | null) {
    gps.current?.begin(t0);
    navigator.vibrate?.(60);
    setPhase({ kind: "running", t0, gunAt });
  }

  function falseStart() {
    timers.current.forEach(clearTimeout);
    tones([[300, 0, 0.25], [300, 0.3, 0.25]], 0.5);
    setPhase({ kind: "false-start" });
  }

  function finish(tEnd: number, by: "gps" | "tap") {
    const ph = phaseRef.current;
    if (ph.kind !== "running") return;
    const seconds = Math.max(0, (tEnd - ph.t0) / 1000);
    const started = motion.current?.startedAt;
    const reaction = ph.gunAt != null && started != null ? (started - ph.gunAt) / 1000 : null;
    SOUNDS.restDone();
    navigator.vibrate?.([80, 60, 80]);
    setPhase({ kind: "result", seconds, reaction, by, gpsDist: gps.current?.distance ?? 0, top: gps.current?.topSpeed ?? 0 });
  }

  async function save(seconds: number) {
    await onRun(Math.round(seconds * 100) / 100, distance);
    setRuns((r) => [...r, seconds]);
    setRestUntil(performance.now() + 150_000);
    setPhase({ kind: "setup" });
  }

  const best = runs.length ? Math.min(...runs) : null;
  const restLeft = restUntil ? Math.max(0, Math.ceil((restUntil - now) / 1000)) : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex select-none flex-col bg-slate-950 px-5"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)", paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
      onPointerDown={() => phase.kind === "running" && finish(performance.now(), "tap")}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-400">🏃 Sprint {distance} m</span>
        <button className="btn-ghost h-11 w-11 text-lg" onClick={onClose} aria-label="Schließen">✕</button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        {phase.kind === "setup" && (
          <>
            {restLeft > 0 && (
              <p className="text-sm text-sky-300">
                Pause: noch {Math.floor(restLeft / 60)}:{String(restLeft % 60).padStart(2, "0")}
              </p>
            )}
            <div className="flex gap-2">
              {DISTANCES.map((d) => (
                <button key={d} onClick={() => setDistance(d)} className={`rounded-full px-3 py-1.5 text-sm ${d === distance ? "bg-slate-200 text-slate-900" : "bg-slate-800"}`}>
                  {d} m
                </button>
              ))}
            </div>
            <div className="grid w-full max-w-sm grid-cols-2 gap-2 text-left">
              <button onClick={() => setMode("signal")} className={`card p-3 ${mode === "signal" ? "border-emerald-600" : ""}`}>
                <div className="text-sm font-medium">🔊 Startsignal</div>
                <div className="text-[11px] text-slate-400">Piep nach zufälliger Pause, misst auch deine Reaktionszeit</div>
              </button>
              <button onClick={() => setMode("motion")} className={`card p-3 ${mode === "motion" ? "border-emerald-600" : ""}`}>
                <div className="text-sm font-medium">🏃 Selbststart</div>
                <div className="text-[11px] text-slate-400">Uhr startet mit deinem ersten Schritt</div>
              </button>
            </div>
            <label className="flex max-w-sm items-start gap-2 text-left text-xs text-slate-400">
              <input type="checkbox" className="mt-0.5" checked={useGps} onChange={(e) => setUseGps(e.target.checked)} />
              <span>
                📍 Automatisch stoppen per GPS bei {distance} m
                {useGps && (
                  <span className={`block ${gpsError ? "text-amber-300" : gpsAcc != null && gpsAcc <= 8 ? "text-emerald-400" : "text-slate-500"}`}>
                    {gpsError ?? (gpsAcc == null ? "GPS sucht …" : `Genauigkeit ±${Math.round(gpsAcc)} m${gpsAcc > 8 ? " – kurz warten, unter freiem Himmel" : " ✓"}`)}
                  </span>
                )}
              </span>
            </label>
            <p className="max-w-sm text-[11px] text-slate-500">
              Handy fest in die Hand nehmen. Im Ziel irgendwo auf den Bildschirm tippen, das stoppt immer
              {useGps ? " (GPS stoppt sonst automatisch, ± ein paar Zehntel)" : ""}.
            </p>
            {!motionOk && <p className="text-xs text-amber-300">Bewegungssensor nicht erlaubt – Selbststart geht nicht, Startsignal schon.</p>}
            <button className="btn-primary w-full max-w-sm py-5 text-xl" onClick={ready}>
              Bereit
            </button>
          </>
        )}

        {phase.kind === "set" && <p className="text-3xl font-semibold">Auf die Plätze …<br />Fertig – still halten</p>}
        {phase.kind === "armed" && (
          <p className="text-3xl font-semibold">{mode === "motion" ? "Los, wenn du bereit bist" : "Warte auf den Piep …"}</p>
        )}
        {phase.kind === "false-start" && (
          <>
            <p className="text-3xl font-semibold text-red-400">Fehlstart</p>
            <button className="btn-primary px-8 py-4 text-lg" onClick={() => setPhase({ kind: "setup" })}>Nochmal</button>
          </>
        )}

        {phase.kind === "running" && (
          <>
            <p className="font-mono text-7xl font-bold tabular-nums">{fmtSprint((now - phase.t0) / 1000)}</p>
            {gps.current && <p className="text-sm text-slate-400">📍 {Math.round(gps.current.distance)} / {distance} m</p>}
            <p className="text-lg text-slate-300">Im Ziel: irgendwo tippen</p>
          </>
        )}

        {phase.kind === "result" && (
          <>
            <p className="font-mono text-7xl font-bold tabular-nums">{fmtSprint(phase.seconds)}</p>
            <p className="text-sm text-slate-400">
              {distance} m · gestoppt per {phase.by === "gps" ? "GPS" : "Tipp"}
              {phase.reaction != null && phase.reaction > 0 && ` · Reaktion ${fmtSprint(phase.reaction)} s`}
              {phase.top > 0 && ` · Spitze ~${Math.round(phase.top * 3.6)} km/h`}
            </p>
            {best != null && (
              <p className={`text-sm ${phase.seconds < best ? "text-amber-300" : "text-slate-400"}`}>
                {phase.seconds < best ? "🏆 Bester Lauf heute!" : `Heute bester: ${fmtSprint(best)} s`}
              </p>
            )}
            <div className="flex w-full max-w-sm flex-col gap-2">
              <button className="btn-primary py-4 text-lg" onClick={() => save(phase.seconds)}>
                ✓ Lauf {runs.length + 1} speichern
              </button>
              <button className="btn-ghost py-3" onClick={() => setPhase({ kind: "setup" })}>Verwerfen</button>
            </div>
          </>
        )}
      </div>

      {runs.length > 0 && (
        <p className="text-center font-mono text-xs text-slate-500">Heute: {runs.map(fmtSprint).join(" · ")}</p>
      )}
    </div>
  );
}

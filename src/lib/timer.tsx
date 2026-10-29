import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

const KEY = "rest-timer-end";

interface TimerState {
  endsAt: number | null;
  total: number;
  remaining: number;
  start: (seconds: number) => void;
  add: (seconds: number) => void;
  stop: () => void;
}

const Ctx = createContext<TimerState | null>(null);

let audio: AudioContext | null = null;

/** Must be called from a user gesture (iOS only unlocks audio there). */
function unlockAudio() {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    /* no audio available */
  }
}

function beep() {
  if (!audio) return;
  [0, 0.25, 0.5].forEach((t) => {
    const osc = audio!.createOscillator();
    const gain = audio!.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, audio!.currentTime + t);
    gain.gain.exponentialRampToValueAtTime(0.001, audio!.currentTime + t + 0.2);
    osc.connect(gain).connect(audio!.destination);
    osc.start(audio!.currentTime + t);
    osc.stop(audio!.currentTime + t + 0.2);
  });
}

function readStored(): { endsAt: number; total: number } | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function RestTimerProvider({ children }: { children: ReactNode }) {
  const stored = readStored();
  const [endsAt, setEndsAt] = useState<number | null>(stored && stored.endsAt > Date.now() ? stored.endsAt : null);
  const [total, setTotal] = useState(stored?.total ?? 120);
  const [now, setNow] = useState(Date.now());
  const fired = useRef(false);

  const persist = (e: number | null, t: number) => {
    try {
      if (e) localStorage.setItem(KEY, JSON.stringify({ endsAt: e, total: t }));
      else localStorage.removeItem(KEY);
    } catch {
      /* storage unavailable */
    }
  };

  const start = useCallback((seconds: number) => {
    unlockAudio();
    const e = Date.now() + seconds * 1000;
    fired.current = false;
    setEndsAt(e);
    setTotal(seconds);
    persist(e, seconds);
  }, []);

  const add = useCallback((seconds: number) => {
    setEndsAt((e) => {
      if (!e) return e;
      const next = e + seconds * 1000;
      setTotal((t) => {
        persist(next, t + seconds);
        return t + seconds;
      });
      return next;
    });
  }, []);

  const stop = useCallback(() => {
    setEndsAt(null);
    persist(null, 0);
  }, []);

  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);

  useEffect(() => {
    if (endsAt && now >= endsAt && !fired.current) {
      fired.current = true;
      beep();
      navigator.vibrate?.([300, 150, 300]);
      if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
        new Notification("Pause vorbei", { body: "Nächster Satz!" });
      }
      setTimeout(stop, 4000);
    }
  }, [now, endsAt, stop]);

  const remaining = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0;

  return <Ctx.Provider value={{ endsAt, total, remaining, start, add, stop }}>{children}</Ctx.Provider>;
}

export function useRestTimer(): TimerState {
  const c = useContext(Ctx);
  if (!c) throw new Error("useRestTimer outside provider");
  return c;
}

export function fmtSeconds(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

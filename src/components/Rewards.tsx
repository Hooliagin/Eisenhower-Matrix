import { useEffect, useRef, useState } from "react";
import { useCharacter } from "../lib/data";
import { ATTR_ORDER, ATTRS, characterLevel, rank, type Attribute } from "../lib/character";
import { SOUNDS, unlockAudio } from "../lib/sound";
import { worldBus } from "../world/bus";
import { levels } from "./Character";

interface Toast {
  id: number;
  icon: string;
  title: string;
  sub?: string;
  color: string;
}
interface LevelUp {
  title: string; // "Körper" or "Charakter"
  level: number;
  color: string;
  rank?: string; // new rank title, if one was reached
}

let pushToast: ((t: Omit<Toast, "id">) => void) | null = null;
/** Show a reward pill from anywhere in the app (e.g. "all dailies done"). */
export function toast(t: Omit<Toast, "id">) {
  pushToast?.(t);
}

const read = <T,>(key: string): T | null => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
};

/** Pixel confetti for a level-up (plain 2D canvas, a couple of seconds, then gone). */
function Confetti({ color }: { color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = (c.width = innerWidth * dpr);
    const h = (c.height = innerHeight * dpr);
    const colors = [color, "#fbbf24", "#fde68a", "#ffffff", "#34d399", "#38bdf8"];
    const parts = Array.from({ length: 110 }, (_, i) => {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const v = (7 + Math.random() * 13) * dpr;
      return { x: w / 2, y: h * 0.52, vx: Math.cos(a) * v, vy: Math.sin(a) * v, s: (4 + Math.random() * 6) * dpr, c: colors[i % colors.length], r: Math.random() * 6 };
    });
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      g.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.vy += 0.42 * dpr;
        p.vx *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        g.globalAlpha = Math.max(0, 1 - t / 2.8);
        g.fillStyle = p.c;
        const s = p.s * (0.6 + 0.4 * Math.sin(t * 9 + p.r)); // flutter
        g.fillRect(Math.round(p.x), Math.round(p.y), p.s, s);
      }
      if (t < 2.8) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [color]);
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" />;
}

/**
 * Game feel for the whole app. Watches the character's XP (server truth) and reacts when it grows:
 * a floating "+10 XP" pill with a chime, the hero on the island cheers, and a level-up gets its own moment.
 * Whatever happened while the app was closed (Claude added things in the chat, another device) is summed up
 * once as "Seit deinem letzten Besuch".
 */
export default function Rewards() {
  const { data, fresh } = useCharacter();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [levelUp, setLevelUp] = useState<LevelUp | null>(null);
  const seen = useRef<Record<string, number> | null>(null); // XP totals already celebrated
  const first = useRef(true);
  const nextId = useRef(1);

  useEffect(() => {
    pushToast = (t) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-3), { ...t, id }]);
      setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 2600);
    };
    // iOS only lets sound start from a touch: wake the audio engine on the first tap anywhere.
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { passive: true });
    return () => {
      pushToast = null;
      window.removeEventListener("pointerdown", unlock);
    };
  }, []);

  const key = data.summary.map((s) => `${s.attribute}:${s.xp_total}`).join(",") + `|${data.skills.map((s) => s.tier).join("")}`;
  useEffect(() => {
    if (!fresh || !data.summary.length || !data.skills.length) return;
    const L = levels(data.summary, data.skills);
    const bonus = data.harmonyWeeks.reduce((s, w) => s + w.bonus_xp, 0);
    const totals = Object.fromEntries(ATTR_ORDER.map((a) => [a, L[a].xp])) as Record<Attribute, number>;
    const charLevel = characterLevel(ATTR_ORDER.reduce((s, a) => s + L[a].xp, 0) + bonus).level;
    const lv: Record<string, number> = { char: charLevel, ...Object.fromEntries(ATTR_ORDER.map((a) => [a, L[a].level])) };

    const before = seen.current ?? read<Record<string, number>>("xp-seen");
    const lvBefore = read<Record<string, number>>("char-levels");
    seen.current = totals;
    write("xp-seen", totals);
    write("char-levels", lv);
    const wasFirst = first.current;
    first.current = false;
    if (!before) return; // very first visit on this device: nothing to compare with

    const gains = ATTR_ORDER.map((a) => ({ a, d: Math.round(totals[a] - (before[a] ?? totals[a])) })).filter((g) => g.d > 0);
    if (gains.length) {
      if (wasFirst) {
        const sum = gains.reduce((s, g) => s + g.d, 0);
        toast({ icon: "✨", title: `+${sum} XP seit deinem letzten Besuch`, sub: gains.map((g) => `${ATTRS[g.a].emoji} ${g.d}`).join("  "), color: "#fbbf24" });
      } else {
        gains.forEach((g, i) =>
          setTimeout(() => {
            toast({ icon: ATTRS[g.a].emoji, title: `+${g.d} XP`, sub: ATTRS[g.a].label, color: ATTRS[g.a].color });
            worldBus.emit({ type: "celebrate", color: ATTRS[g.a].color });
            SOUNDS.xp();
            navigator.vibrate?.(14);
          }, i * 350),
        );
      }
    }

    if (lvBefore) {
      const ups = Object.keys(lv).filter((k) => lvBefore[k] != null && lv[k] > lvBefore[k]);
      // the character level is the bigger moment; otherwise the attribute that rose
      const k = ups.includes("char") ? "char" : ups[0];
      if (k) {
        const a = k === "char" ? null : (k as Attribute);
        const newRank = a && rank(a, lv[k]).title !== rank(a, lvBefore[k]).title ? rank(a, lv[k]).title : undefined;
        setTimeout(
          () => {
            setLevelUp({ title: a ? ATTRS[a].label : "Charakter", level: lv[k], color: a ? ATTRS[a].color : "#fbbf24", rank: newRank });
            worldBus.emit({ type: "levelup" });
            SOUNDS.levelUp();
            navigator.vibrate?.([30, 60, 30, 60, 90]);
          },
          wasFirst ? 900 : 600,
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fresh]);

  useEffect(() => {
    if (!levelUp) return;
    const id = setTimeout(() => setLevelUp(null), 4200);
    return () => clearTimeout(id);
  }, [levelUp]);

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-4" style={{ top: "calc(env(safe-area-inset-top) + 0.6rem)" }} aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-2.5 rounded-full border bg-slate-950/90 py-1.5 pl-2 pr-4 shadow-lift backdrop-blur"
            style={{ borderColor: `${t.color}66`, boxShadow: `0 0 24px -4px ${t.color}88, 0 12px 30px -12px #000`, animation: "floatup 2.6s cubic-bezier(.2,.8,.2,1) forwards" }}
          >
            <span className="grid h-8 w-8 place-items-center rounded-full text-base" style={{ background: `${t.color}26` }}>
              {t.icon}
            </span>
            <span className="leading-tight">
              <span className="block font-pixel text-base text-white">{t.title}</span>
              {t.sub && <span className="block text-[11px] text-slate-300">{t.sub}</span>}
            </span>
          </div>
        ))}
      </div>

      {levelUp && (
        <button className="fixed inset-0 z-[85] grid animate-fade place-items-center overflow-hidden bg-black/75 backdrop-blur-sm" onClick={() => setLevelUp(null)} aria-label="Level-up schließen">
          <span
            aria-hidden
            className="absolute left-1/2 top-1/2 h-[150vmax] w-[150vmax] -translate-x-1/2 -translate-y-1/2 opacity-30"
            style={{ background: `repeating-conic-gradient(from 0deg, ${levelUp.color} 0deg 7deg, transparent 7deg 20deg)`, animation: "ray 26s linear infinite", maskImage: "radial-gradient(circle, #000 0%, transparent 62%)", WebkitMaskImage: "radial-gradient(circle, #000 0%, transparent 62%)" }}
          />
          <Confetti color={levelUp.color} />
          <span className="relative flex animate-pop flex-col items-center gap-1 text-center">
            <span className="font-pixel text-sm tracking-[0.3em] text-amber-200">LEVEL UP</span>
            <span className="font-pixel text-[112px] leading-none" style={{ color: levelUp.color, textShadow: `0 0 40px ${levelUp.color}aa, 0 6px 0 #0008` }}>
              {levelUp.level}
            </span>
            <span className="font-pixel text-2xl text-white">{levelUp.title}</span>
            {levelUp.rank && <span className="mt-1 rounded-full bg-white/10 px-3 py-1 font-pixel text-sm text-amber-200">Neuer Rang: {levelUp.rank}</span>}
            <span className="mt-6 text-xs text-white/50">tippen zum Weitermachen</span>
          </span>
        </button>
      )}
    </>
  );
}

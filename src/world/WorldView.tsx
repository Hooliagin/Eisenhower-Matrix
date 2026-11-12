import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import PixelAvatar from "../components/PixelAvatar";
import { PixelPouchi } from "../components/Pouchi";
import type { Balance } from "../lib/character";
import { worldBus } from "./bus";
import { skyAt } from "./sky";
import type { Hit, World, WorldState } from "./World";

export type { Hit };

/** Per-device switch: the 3D island or the lightweight pixel sprite. */
export function use3D(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem("world-3d") !== "0";
    } catch {
      return true;
    }
  });
  return [
    on,
    (v) => {
      setOn(v);
      try {
        localStorage.setItem("world-3d", v ? "1" : "0");
      } catch {
        /* storage unavailable */
      }
    },
  ];
}

interface Props {
  balance: Balance;
  enabled?: boolean;
  onTap?: (hit: Hit) => void;
  className?: string;
  /** HUD drawn over the scene. */
  children?: ReactNode;
}

/**
 * The living island: sky by CSS (instant), the 3D scene loads on demand on top of it.
 * The scene only renders while it is on screen and the app is in the foreground.
 */
export default function WorldView({ balance, enabled = true, onTap, className = "", children }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const world = useRef<World | null>(null);
  const tap = useRef(onTap);
  tap.current = onTap;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const sky = useMemo(() => skyAt(now), [now]);
  const state: WorldState = useMemo(
    () => ({ shares: balance.shares, effects: balance.effects, enough: balance.total >= 60, date: now }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(balance.shares), JSON.stringify(balance.effects), balance.total >= 60, now],
  );
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let w: World | null = null;
    let cleanup = () => {};
    import("./World")
      .then(({ World }) => {
        if (!alive || !canvas.current || !box.current) return;
        w = new World(canvas.current, (hit) => tap.current?.(hit));
        world.current = w;
        if (import.meta.env.DEV) (window as unknown as { __world?: World }).__world = w;
        w.setState(stateRef.current);
        const el = box.current;
        const size = () => w!.resize(el.clientWidth, el.clientHeight, window.devicePixelRatio || 1);
        size();
        const ro = new ResizeObserver(size);
        ro.observe(el);
        let onScreen = true;
        const run = () => w!.setRunning(onScreen && document.visibilityState === "visible");
        const io = new IntersectionObserver(([e]) => {
          onScreen = e.isIntersecting;
          run();
        });
        io.observe(el);
        document.addEventListener("visibilitychange", run);
        const off = worldBus.on((e) => (e.type === "celebrate" ? w!.celebrate(e.color) : e.type === "levelup" ? w!.levelUp() : undefined));
        run();
        setReady(true);
        cleanup = () => {
          ro.disconnect();
          io.disconnect();
          document.removeEventListener("visibilitychange", run);
          off();
        };
      })
      .catch((e) => {
        console.error("[world]", e);
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
      cleanup();
      w?.dispose();
      world.current = null;
      setReady(false);
    };
  }, [enabled]);

  useEffect(() => {
    world.current?.setState(state);
  }, [state, ready]);

  const show3D = enabled && !failed;
  return (
    <div ref={box} className={`relative overflow-hidden ${className}`} style={{ background: `linear-gradient(180deg, ${sky.top} 0%, ${sky.bottom} 78%, ${sky.bottom} 100%)` }}>
      {show3D && <canvas ref={canvas} className={`absolute inset-0 h-full w-full transition-opacity duration-700 ${ready ? "opacity-100" : "opacity-0"}`} style={{ touchAction: "pan-y" }} />}
      {(!show3D || !ready) && (
        <button className="absolute inset-0 flex items-end justify-center pb-[18%]" onClick={() => onTap?.("hero")} aria-label="Charakter öffnen">
          <span className="flex items-end">
            <PixelAvatar size={150} glow="#fbbf24" />
            <span className="-ml-3 mb-1">
              <PixelPouchi size={42} />
            </span>
          </span>
        </button>
      )}
      {children}
    </div>
  );
}

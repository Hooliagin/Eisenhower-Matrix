import { useEffect, useState } from "react";
import type { BreathKind } from "../lib/breath";

/** Circle that grows on the inhale and shrinks on the exhale, timed to the current step. */
export default function BreathCircle({ kind, seconds, stepKey, size = 220, color = "#a5b4fc" }: {
  kind: BreathKind;
  seconds: number;
  stepKey: string | number;
  size?: number;
  color?: string;
}) {
  const [scale, setScale] = useState(0.45);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (kind === "hold") return setDuration(0.3); // stay where we are
    setDuration(seconds);
    // next frame so the transition picks up the new target
    const id = requestAnimationFrame(() => setScale(kind === "in" ? 1 : kind === "out" ? 0.45 : 0.7));
    return () => cancelAnimationFrame(id);
  }, [kind, seconds, stepKey]);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full border opacity-20" style={{ borderColor: color }} />
      <div
        className="rounded-full"
        style={{
          width: size,
          height: size,
          background: `radial-gradient(circle, ${color}cc 0%, ${color}55 60%, ${color}11 100%)`,
          transform: `scale(${scale})`,
          transition: `transform ${duration}s ${kind === "hold" ? "linear" : "ease-in-out"}`,
          boxShadow: kind === "hold" ? `0 0 0 4px ${color}44` : undefined,
        }}
      />
    </div>
  );
}

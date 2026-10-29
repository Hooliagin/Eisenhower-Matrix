export interface IntervalConfig {
  rounds: number;
  work: number; // seconds
  rest: number; // seconds between rounds
  prep?: number; // countdown before round 1
}

export type PhaseKind = "prep" | "work" | "rest" | "done";

export interface Phase {
  kind: Exclude<PhaseKind, "done">;
  round: number;
  seconds: number;
}

export function phases(cfg: IntervalConfig): Phase[] {
  const list: Phase[] = [];
  if (cfg.prep) list.push({ kind: "prep", round: 1, seconds: cfg.prep });
  for (let r = 1; r <= cfg.rounds; r++) {
    list.push({ kind: "work", round: r, seconds: cfg.work });
    if (r < cfg.rounds && cfg.rest) list.push({ kind: "rest", round: r + 1, seconds: cfg.rest });
  }
  return list;
}

export const totalSeconds = (cfg: IntervalConfig) => phases(cfg).reduce((s, p) => s + p.seconds, 0);

/** Where we are after `elapsed` seconds. */
export function stateAt(cfg: IntervalConfig, elapsed: number) {
  const list = phases(cfg);
  let t = elapsed;
  for (let i = 0; i < list.length; i++) {
    if (t < list[i].seconds) return { index: i, kind: list[i].kind as PhaseKind, round: list[i].round, remaining: Math.ceil(list[i].seconds - t), phaseSeconds: list[i].seconds };
    t -= list[i].seconds;
  }
  return { index: list.length, kind: "done" as PhaseKind, round: cfg.rounds, remaining: 0, phaseSeconds: 0 };
}

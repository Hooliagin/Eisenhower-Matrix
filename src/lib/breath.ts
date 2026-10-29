export type BreathKind = "in" | "out" | "hold" | "free";

export interface BreathStep {
  kind: BreathKind;
  seconds: number; // for open-ended steps: the maximum
  label: string;
  open?: boolean; // ends when the user taps (e.g. Wim Hof retention)
  breath?: number; // counter shown as "Atemzug x / total"
  breaths?: number;
  round?: number;
  rounds?: number;
}

export interface BreathExercise {
  id: string;
  name: string;
  emoji: string;
  goal: string;
  how: string;
  warning?: string;
  targetRate?: number; // breaths per minute, compared with the sensor-measured rate
  steps: () => BreathStep[];
}

const repeatFor = (minutes: number, cycle: BreathStep[]) => {
  const cycleSec = cycle.reduce((s, c) => s + c.seconds, 0);
  const n = Math.max(1, Math.round((minutes * 60) / cycleSec));
  return Array.from({ length: n }, (_, i) => cycle.map((c) => ({ ...c, breath: i + 1, breaths: n }))).flat();
};

export const EXERCISES: BreathExercise[] = [
  {
    id: "resonance",
    targetRate: 5.5,
    name: "Resonanz-Atmung",
    emoji: "🌊",
    goal: "Ruhe & Herzratenvariabilität",
    how: "5,5 s ein, 5,5 s aus (~5,5 Atemzüge/min) · 5 min · durch die Nase, in den Bauch",
    steps: () => repeatFor(5, [
      { kind: "in", seconds: 5.5, label: "Einatmen" },
      { kind: "out", seconds: 5.5, label: "Ausatmen" },
    ]),
  },
  {
    id: "sigh",
    targetRate: 6.7,
    name: "Zyklisches Seufzen",
    emoji: "😮‍💨",
    goal: "Stimmung heben, runterkommen",
    how: "2 s ein, kurz nachziehen, 6 s lang durch den Mund aus · 5 min",
    steps: () => repeatFor(5, [
      { kind: "in", seconds: 2, label: "Einatmen (Nase)" },
      { kind: "in", seconds: 1, label: "Nachziehen" },
      { kind: "out", seconds: 6, label: "Langsam ausatmen (Mund)" },
    ]),
  },
  {
    id: "box",
    targetRate: 3.75,
    name: "Box Breathing",
    emoji: "⬜",
    goal: "Fokus & Stress",
    how: "4 s ein · 4 s halten · 4 s aus · 4 s halten · 5 min",
    steps: () => repeatFor(5, [
      { kind: "in", seconds: 4, label: "Einatmen" },
      { kind: "hold", seconds: 4, label: "Halten" },
      { kind: "out", seconds: 4, label: "Ausatmen" },
      { kind: "hold", seconds: 4, label: "Leer halten" },
    ]),
  },
  {
    id: "478",
    targetRate: 3.2,
    name: "4-7-8",
    emoji: "🌙",
    goal: "Einschlafen",
    how: "4 s ein · 7 s halten · 8 s aus · 4 Durchgänge",
    steps: () =>
      Array.from({ length: 4 }, (_, i) => [
        { kind: "in" as const, seconds: 4, label: "Einatmen (Nase)", breath: i + 1, breaths: 4 },
        { kind: "hold" as const, seconds: 7, label: "Halten", breath: i + 1, breaths: 4 },
        { kind: "out" as const, seconds: 8, label: "Ausatmen (Mund, hörbar)", breath: i + 1, breaths: 4 },
      ]).flat(),
  },
  {
    id: "wimhof",
    targetRate: 20,
    name: "Wim Hof",
    emoji: "🧊",
    goal: "Energie & Kälte-Resilienz",
    how: "3 Runden: 30 tiefe Atemzüge → aus & Luft anhalten (so lange es geht, dann tippen) → tief ein & 15 s halten",
    warning: "Nur sitzend oder liegend – nie im Wasser, beim Fahren oder Stehen. Kribbeln & Schwindel sind normal; bei Unwohlsein abbrechen.",
    steps: () =>
      Array.from({ length: 3 }, (_, r) => [
        ...Array.from({ length: 30 }, (_, b) => [
          { kind: "in" as const, seconds: 1.6, label: "Tief ein", breath: b + 1, breaths: 30, round: r + 1, rounds: 3 },
          { kind: "out" as const, seconds: 1.4, label: "Locker aus", breath: b + 1, breaths: 30, round: r + 1, rounds: 3 },
        ]).flat(),
        { kind: "out" as const, seconds: 2, label: "Ausatmen …", round: r + 1, rounds: 3 },
        { kind: "hold" as const, seconds: 180, label: "Luft anhalten – tippe, wenn du atmen musst", open: true, round: r + 1, rounds: 3 },
        { kind: "in" as const, seconds: 2, label: "Tief einatmen", round: r + 1, rounds: 3 },
        { kind: "hold" as const, seconds: 15, label: "Halten", round: r + 1, rounds: 3 },
        { kind: "out" as const, seconds: 3, label: "Ausatmen", round: r + 1, rounds: 3 },
      ]).flat(),
  },
  {
    id: "fire",
    name: "Feueratem (Kapalabhati)",
    emoji: "🔥",
    goal: "Wach werden, Energie",
    how: "3 Runden: 30 s kräftig durch die Nase ausstoßen, Einatmen passiv (~1×/s) · dazwischen 30 s ruhig atmen",
    warning: "Nicht bei Schwangerschaft, Bluthochdruck, Herzproblemen oder Epilepsie. Bei Schwindel aufhören.",
    steps: () =>
      Array.from({ length: 3 }, (_, r) => [
        ...Array.from({ length: 30 }, (_, b) => [
          { kind: "out" as const, seconds: 0.4, label: "Stoß aus", breath: b + 1, breaths: 30, round: r + 1, rounds: 3 },
          { kind: "in" as const, seconds: 0.6, label: "passiv ein", breath: b + 1, breaths: 30, round: r + 1, rounds: 3 },
        ]).flat(),
        ...(r < 2 ? [{ kind: "free" as const, seconds: 30, label: "Ruhig atmen", round: r + 1, rounds: 3 }] : []),
      ]).flat(),
  },
];

/** Coherent breathing pace used by the meditation breath guide. */
export const RESONANCE = { in: 5.5, out: 5.5 };

export const totalSeconds = (steps: BreathStep[]) => steps.reduce((s, x) => s + x.seconds, 0);

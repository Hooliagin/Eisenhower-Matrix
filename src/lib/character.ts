export type Attribute = "koerper" | "intellekt" | "charisma";

export const ATTRS: Record<Attribute, { label: string; emoji: string; color: string; how: string }> = {
  koerper: { label: "Körper", emoji: "💪", color: "#f87171", how: "Trainings (75 XP pro Einheit) und Körper-Aufgaben" },
  intellekt: { label: "Intellekt", emoji: "🧠", color: "#38bdf8", how: "Lesezeit (1 XP pro Minute) und Denk-Aufgaben" },
  charisma: { label: "Charisma", emoji: "✨", color: "#fbbf24", how: "Impro-Übungen und soziale Aufgaben" },
};

export const ATTR_ORDER: Attribute[] = ["koerper", "intellekt", "charisma"];

export interface AttrSummary {
  attribute: Attribute;
  xp_total: number;
  xp_14: number;
  xp_prev_14: number;
}

export interface CharacterStat {
  id: string;
  attribute: Attribute;
  name: string;
  rating: number;
  note: string | null;
  position: number;
}

// 1 XP ≈ 1 invested minute. Level n starts at 30·(n-1)² XP: lvl 5 ≈ 8 h, lvl 11 ≈ 50 h, lvl 21 ≈ 200 h.
const STEP = 30;
export const levelFromXp = (xp: number) => Math.floor(Math.sqrt(xp / STEP)) + 1;
export const xpForLevel = (level: number) => STEP * (level - 1) ** 2;

export function levelProgress(xp: number) {
  const level = levelFromXp(xp);
  const from = xpForLevel(level);
  const to = xpForLevel(level + 1);
  return { level, pct: (xp - from) / (to - from), toNext: to - xp };
}

/** Last 14 days vs the 14 before. */
export function trend(s: AttrSummary): "up" | "down" | "flat" {
  if (s.xp_14 === 0 && s.xp_prev_14 === 0) return "flat";
  if (s.xp_14 > s.xp_prev_14 * 1.1) return "up";
  if (s.xp_14 < s.xp_prev_14 * 0.9) return "down";
  return "flat";
}

export const TREND_ICON = { up: "▲", down: "▼", flat: "▶" } as const;

export type Attribute = "koerper" | "intellekt" | "charisma" | "spirit" | "kreativ" | "verbunden";
export type Element = "feuer" | "wasser" | "erde" | "luft";

export const ATTRS: Record<Attribute, { label: string; emoji: string; color: string; how: string; weeklyTarget: number }> = {
  koerper: { label: "Körper", emoji: "💪", color: "#f87171", how: "Trainings (75 XP pro Einheit) und Sport", weeklyTarget: 300 },
  intellekt: { label: "Intellekt", emoji: "🧠", color: "#38bdf8", how: "Lesezeit (1 XP pro Minute), Recherche, Lernen", weeklyTarget: 210 },
  charisma: { label: "Charisma", emoji: "✨", color: "#fbbf24", how: "Impro-Übungen, Gespräche führen, vor Leuten sprechen", weeklyTarget: 60 },
  spirit: { label: "Spiritualität", emoji: "🕊️", color: "#a78bfa", how: "Beten, Meditieren, Stille, religiöse Lektüre", weeklyTarget: 70 },
  kreativ: { label: "Kreativität", emoji: "🎨", color: "#f472b6", how: "Videos schneiden, Websites bauen, Schreiben, Gestalten", weeklyTarget: 180 },
  verbunden: { label: "Verbundenheit", emoji: "🤝", color: "#34d399", how: "Zeit mit Freunden & Familie, Putschi, Geburtstage", weeklyTarget: 180 },
};

export const ATTR_ORDER: Attribute[] = ["koerper", "intellekt", "charisma", "spirit", "kreativ", "verbunden"];

export const ELEMENTS: Record<Element, { label: string; emoji: string; color: string; stands: string; ideas: string }> = {
  feuer: {
    label: "Feuer",
    emoji: "🔥",
    color: "#f97316",
    stands: "Antrieb, Wille, Tatkraft – Training, Projekte vorantreiben, Neues erschaffen",
    ideas: "ein hartes Training, ein Projekt einen echten Schritt weiterbringen, etwas bauen",
  },
  wasser: {
    label: "Wasser",
    emoji: "💧",
    color: "#38bdf8",
    stands: "Gefühl, Verbindung, Spiritualität – Freunde, Familie, Gebet, Meditation, Natur mit Putschi",
    ideas: "jemanden anrufen, meditieren oder beten, bewusst Zeit mit Freunden verbringen",
  },
  erde: {
    label: "Erde",
    emoji: "🌍",
    color: "#a3e635",
    stands: "Basis, Ordnung, Stabilität – Haushalt, Finanzen, Routinen, Schlaf, Ernährung",
    ideas: "Wohnung in Ordnung bringen, Finanzen erledigen, Routinen durchziehen, gut kochen",
  },
  luft: {
    label: "Luft",
    emoji: "💨",
    color: "#e2e8f0",
    stands: "Geist, Denken, Kommunikation – Lesen, Lernen, Recherche, Gespräche, Impro",
    ideas: "lesen, etwas Neues lernen, ein gutes Gespräch führen, Impro üben",
  },
};

export const ELEMENT_ORDER: Element[] = ["feuer", "wasser", "erde", "luft"];

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

/**
 * Current form 0–100: XP of the last 14 days against two weeks of the target.
 * Unlike the level (lifetime, never drops) this sinks when an area is neglected.
 */
export function form(s: AttrSummary): number {
  return Math.min(100, Math.round((s.xp_14 / (ATTRS[s.attribute].weeklyTarget * 2)) * 100));
}

/** Last 14 days vs the 14 before. */
export function trend(s: AttrSummary): "up" | "down" | "flat" {
  if (s.xp_14 === 0 && s.xp_prev_14 === 0) return "flat";
  if (s.xp_14 > s.xp_prev_14 * 1.1) return "up";
  if (s.xp_14 < s.xp_prev_14 * 0.9) return "down";
  return "flat";
}

export const TREND_ICON = { up: "▲", down: "▼", flat: "▶" } as const;

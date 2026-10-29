export type Attribute = "koerper" | "intellekt" | "charisma" | "spirit" | "kreativ" | "verbunden";
export type Element = "feuer" | "wasser" | "erde" | "luft";

export const ATTRS: Record<Attribute, { label: string; emoji: string; color: string; how: string; weeklyTarget: number }> = {
  koerper: { label: "Körper", emoji: "💪", color: "#f87171", how: "Trainings (75 XP pro Einheit) und Sport", weeklyTarget: 300 },
  intellekt: { label: "Intellekt", emoji: "🧠", color: "#38bdf8", how: "Lesezeit (1 XP pro Minute), Recherche, Lernen", weeklyTarget: 210 },
  charisma: { label: "Charisma", emoji: "✨", color: "#fbbf24", how: "Impro-Übungen, Gespräche führen, vor Leuten sprechen", weeklyTarget: 60 },
  spirit: { label: "Spiritualität", emoji: "🕊️", color: "#a78bfa", how: "Beten, Meditieren, Stille, religiöse Lektüre", weeklyTarget: 70 },
  kreativ: { label: "Kreativität", emoji: "🎨", color: "#f472b6", how: "Videos schneiden, Websites bauen, Schreiben, Gestalten", weeklyTarget: 180 },
  verbunden: { label: "Verbundenheit", emoji: "🤝", color: "#34d399", how: "Zeit mit Freunden & Familie, Pouchi, Geburtstage", weeklyTarget: 180 },
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
    stands: "Gefühl, Verbindung, Spiritualität – Freunde, Familie, Gebet, Meditation, Natur mit Pouchi",
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

// ---------- RPG layer: skills, ranks, background ----------

export interface Skill {
  id: string;
  attribute: Attribute;
  name: string;
  icon: string | null;
  tier: number; // 0–5
  note: string | null;
  next_step: string | null;
  position: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string | null;
  icon: string | null;
  attribute: Attribute | null;
  kind: "background" | "milestone";
  earned_on: string | null;
  when_text: string | null;
}

export interface CharacterMeta {
  class_title: string | null;
  credits: number;
  credits_note: string | null;
  credits_next: string | null;
}

export const TIERS = ["Gesperrt", "Novize", "Lehrling", "Fortgeschritten", "Experte", "Meister"] as const;

/**
 * What you could already do before the app counts too: each skill tier is worth background XP
 * for its attribute (Master degree, 10 years of boxing …), so levels don't start at zero.
 */
export const TIER_XP = [0, 60, 240, 600, 1200, 2000];

export function backgroundXp(skills: Skill[], a: Attribute): number {
  return skills.filter((s) => s.attribute === a).reduce((sum, s) => sum + (TIER_XP[s.tier] ?? 0), 0);
}

/** Rank titles per attribute, one every 5 levels – the "Zwischenstufen" between levels. */
const RANKS: Record<Attribute, string[]> = {
  koerper: ["Rekrut", "Kämpfer", "Veteran", "Champion", "Titan", "Legende"],
  intellekt: ["Schüler", "Gelehrter", "Analyst", "Stratege", "Weiser", "Orakel"],
  charisma: ["Stimme", "Redner", "Anführer", "Diplomat", "Visionär", "Ikone"],
  spirit: ["Suchender", "Pilger", "Mönch", "Mystiker", "Erleuchteter", "Heiliger"],
  kreativ: ["Bastler", "Gestalter", "Künstler", "Visionär", "Meister", "Schöpfer"],
  verbunden: ["Einzelgänger", "Gefährte", "Freund", "Hüter", "Clanführer", "Herz des Clans"],
};

export function rank(a: Attribute, level: number): { title: string; next: string | null; nextAt: number } {
  const i = Math.min(RANKS[a].length - 1, Math.floor((level - 1) / 5));
  return { title: RANKS[a][i], next: RANKS[a][i + 1] ?? null, nextAt: (i + 1) * 5 + 1 };
}

/** Character level from all XP together (slower curve than a single attribute). */
export function characterLevel(totalXp: number) {
  const step = 90;
  const level = Math.floor(Math.sqrt(totalXp / step)) + 1;
  const from = step * (level - 1) ** 2;
  const to = step * level ** 2;
  return { level, pct: (totalXp - from) / (to - from), toNext: to - totalXp };
}

export const CREDIT_TIERS = ["Pleite", "Knapp", "Stabil", "Polster", "Wohlhabend", "Frei"] as const;
export const creditTier = (credits: number) => CREDIT_TIERS[Math.min(5, Math.floor(credits / 20))];

// ---------- Balance mechanic: the four elements as buffs/debuffs ----------

/** Which attributes an element feeds. Erde is the foundation and affects everything a little. */
export const ELEMENT_LINKS: Record<Element, Attribute[]> = {
  feuer: ["koerper", "kreativ"],
  wasser: ["spirit", "verbunden"],
  luft: ["intellekt", "charisma"],
  erde: [],
};

export type Effect = "buff" | "debuff" | "neutral";

export const EFFECT_NAMES: Record<Element, { buff: string; debuff: string }> = {
  feuer: { buff: "Entfacht", debuff: "Glut erlischt" },
  wasser: { buff: "Im Fluss", debuff: "Ausgetrocknet" },
  erde: { buff: "Fester Stand", debuff: "Wackliger Boden" },
  luft: { buff: "Klarer Kopf", debuff: "Dicke Luft" },
};

export interface Balance {
  total: number;
  shares: Record<Element, number>;
  harmony: number; // 0–100, normalized entropy of the four shares
  effects: Record<Element, Effect>;
  weakest: Element;
}

/** Last 7 days of element minutes → harmony score and a status effect per element (≥ 22 % buff, < 10 % debuff). */
export function balance(minutes: Partial<Record<Element, number>>): Balance {
  const m = Object.fromEntries(ELEMENT_ORDER.map((e) => [e, Math.max(0, minutes[e] ?? 0)])) as Record<Element, number>;
  const total = ELEMENT_ORDER.reduce((s, e) => s + m[e], 0);
  const shares = Object.fromEntries(ELEMENT_ORDER.map((e) => [e, total ? m[e] / total : 0])) as Record<Element, number>;
  const h = -ELEMENT_ORDER.reduce((s, e) => s + (shares[e] > 0 ? shares[e] * Math.log(shares[e]) : 0), 0) / Math.log(4);
  const enough = total >= 60;
  const effects = Object.fromEntries(
    ELEMENT_ORDER.map((e) => [e, !enough ? "neutral" : shares[e] >= 0.22 ? "buff" : shares[e] < 0.1 ? "debuff" : "neutral"]),
  ) as Record<Element, Effect>;
  const weakest = [...ELEMENT_ORDER].sort((a, b) => shares[a] - shares[b])[0];
  return { total, shares, harmony: Math.round(h * 100), effects, weakest };
}

/** Form multiplier for an attribute from the element effects: own element ±15 %, Erde (foundation) ±5/10 % for all. */
export function formMultiplier(a: Attribute, effects: Record<Element, Effect>): { mult: number; sources: { element: Element; pct: number }[] } {
  const sources: { element: Element; pct: number }[] = [];
  for (const e of ELEMENT_ORDER) {
    const linked = ELEMENT_LINKS[e].includes(a);
    if (!linked && e !== "erde") continue;
    const pct = effects[e] === "buff" ? (linked ? 15 : 5) : effects[e] === "debuff" ? (linked ? -15 : -10) : 0;
    if (pct) sources.push({ element: e, pct });
  }
  return { mult: 1 + sources.reduce((s, x) => s + x.pct, 0) / 100, sources };
}

export const effectiveForm = (s: AttrSummary, effects: Record<Element, Effect>) =>
  Math.max(0, Math.min(100, Math.round(form(s) * formMultiplier(s.attribute, effects).mult)));

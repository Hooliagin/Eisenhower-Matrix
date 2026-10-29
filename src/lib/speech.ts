import type { Quadrant } from "./types";

// Web Speech API is still vendor-prefixed in Safari and untyped in lib.dom.
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

export function speechSupported(): boolean {
  return "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
}

export function createRecognition(): Recognition | null {
  const Ctor = (window as unknown as Record<string, unknown>).SpeechRecognition ??
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  if (!Ctor) return null;
  const r = new (Ctor as new () => Recognition)();
  r.lang = "de-DE";
  r.interimResults = true;
  r.continuous = true;
  return r;
}

export interface ParsedTask {
  title: string;
  quadrant: Quadrant;
  estimate_minutes: number | null;
}

const WORDS: Record<string, number> = {
  ein: 1, eine: 1, halbe: 0.5, zwei: 2, drei: 3, vier: 4, fünf: 5, zehn: 10, fünfzehn: 15,
  zwanzig: 20, dreißig: 30, vierzig: 40, fünfundvierzig: 45, sechzig: 60, neunzig: 90,
};

const DURATION = /\b(?:ca\.?\s*|etwa\s*|ungefähr\s*)?(\d+(?:[.,]\d+)?|fünfundvierzig|fünfzehn|zwanzig|dreißig|vierzig|sechzig|neunzig|zwei|drei|vier|fünf|zehn|eine?|halbe)\s*(min(?:uten?)?|h|std\.?|stunden?)(?=[^a-zäöü]|$)/i;

/** Pull "30 min" / "1,5 Stunden" / "eine Stunde" out of a task text. */
export function extractDuration(text: string): { rest: string; minutes: number | null } {
  const m = text.match(DURATION);
  if (!m) return { rest: text, minutes: null };
  const n = WORDS[m[1].toLowerCase()] ?? Number(m[1].replace(",", "."));
  const minutes = Math.round(/^min/i.test(m[2]) ? n : n * 60);
  const rest = text.replace(m[0], "").replace(/\s*,\s*$/, "").replace(/\s{2,}/g, " ").trim();
  return { rest, minutes: minutes > 0 ? minutes : null };
}

const URGENT = /\b(dringend|sofort|heute|asap|eilig|gleich)\b/i;
const IMPORTANT = /\b(wichtig|unbedingt|muss)\b/i;
const FILLER = /\b(ist )?(sehr |total )?(dringend|wichtig|eilig)\b[,.]?/gi;

/** Guess the quadrant from keywords; untagged tasks land in the inbox for sorting. */
export function guessQuadrant(text: string): Quadrant {
  const u = URGENT.test(text);
  const i = IMPORTANT.test(text);
  if (u && i) return "do";
  if (i) return "schedule";
  if (u) return "delegate";
  return "inbox";
}

/** Split a dictated sentence into several tasks ("…, außerdem …, und dann …"). */
export function parseDictation(text: string): ParsedTask[] {
  return text
    .split(/(?:[.;\n]|,?\s+(?:außerdem|und dann|dann noch|als nächstes|nächste aufgabe)\s+)/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
    .map((s) => {
      const quadrant = guessQuadrant(s);
      const { rest, minutes } = extractDuration(s);
      const title = rest.replace(FILLER, "").replace(/\s{2,}/g, " ").replace(/[,\s]+$/, "").trim().replace(/^./, (c) => c.toUpperCase());
      return { title: title || s, quadrant, estimate_minutes: minutes };
    });
}

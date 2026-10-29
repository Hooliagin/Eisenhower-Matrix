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
      const title = s.replace(FILLER, "").replace(/\s{2,}/g, " ").trim().replace(/^./, (c) => c.toUpperCase());
      return { title: title || s, quadrant };
    });
}

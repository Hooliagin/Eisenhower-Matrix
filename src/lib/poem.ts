/** Poem memorization helpers (pure logic): stanzas, cloze text and comparing a spoken recitation with the text. */

export function stanzas(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Lowercase, drop punctuation and quotes, unify ß/ss and apostrophes ("flackert's" → "flackerts"). */
export function normWord(w: string): string {
  return w
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[’'`´]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function words(text: string): string[] {
  return text.split(/\s+/).map(normWord).filter(Boolean);
}

export type DiffOp =
  | { kind: "ok"; word: string } // said correctly
  | { kind: "missing"; word: string } // in the poem, not said
  | { kind: "wrong"; word: string; said: string } // said something else in its place
  | { kind: "extra"; said: string }; // said, but not in the poem

/** Small edits (Knecht/Knechte, Ruh/Ruhe) are often the recognizer, not the memory: count them as correct. */
function close(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) === 1 && (a.startsWith(b) || b.startsWith(a)) && Math.min(a.length, b.length) >= 3) return true;
  if (Math.min(a.length, b.length) < 4) return false;
  return lev(a, b) <= (Math.max(a.length, b.length) >= 8 ? 2 : 1);
}

function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/**
 * Word-level alignment of the expected text with what was said (edit distance with substitutions),
 * so the trainer can show exactly where words were skipped, swapped or added.
 */
export function compare(expectedText: string, spokenText: string): { ops: DiffOp[]; accuracy: number } {
  const raw = expectedText.split(/\s+/).filter((w) => normWord(w));
  const exp = raw.map(normWord);
  const got = words(spokenText);
  const n = exp.length;
  const m = got.length;
  const cost = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 0; i <= n; i++) cost[i][0] = i;
  for (let j = 0; j <= m; j++) cost[0][j] = j;
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      cost[i][j] = Math.min(cost[i - 1][j] + 1, cost[i][j - 1] + 1, cost[i - 1][j - 1] + (close(exp[i - 1], got[j - 1]) ? 0 : 1));
  const ops: DiffOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && cost[i][j] === cost[i - 1][j - 1] + (close(exp[i - 1], got[j - 1]) ? 0 : 1)) {
      ops.push(close(exp[i - 1], got[j - 1]) ? { kind: "ok", word: raw[i - 1] } : { kind: "wrong", word: raw[i - 1], said: got[j - 1] });
      i--;
      j--;
    } else if (i > 0 && cost[i][j] === cost[i - 1][j] + 1) {
      ops.push({ kind: "missing", word: raw[i - 1] });
      i--;
    } else {
      ops.push({ kind: "extra", said: got[j - 1] });
      j--;
    }
  }
  ops.reverse();
  const ok = ops.filter((o) => o.kind === "ok").length;
  return { ops, accuracy: n ? ok / n : 0 };
}

/** Cloze: keep the first letter of each word, hide the rest ("Die M_______ zog …"); level 0 = full text, 2 = only first letters. */
export function cloze(text: string, level: 0 | 1 | 2, seed = 1): string {
  if (level === 0) return text;
  let k = seed;
  return text.replace(/\p{L}[\p{L}'’]*/gu, (w) => {
    k = (k * 9301 + 49297) % 233280;
    const hide = level === 2 || k / 233280 < 0.5;
    return hide && w.length > 1 ? w[0] + "_".repeat(w.length - 1) : w;
  });
}

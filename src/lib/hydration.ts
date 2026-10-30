/**
 * Trink-Erinnerung: wann ist ein Glas fällig?
 *
 * Grundlage: EFSA 2010 – Männer ~2,5 L Wasser/Tag, davon ~80 % aus Getränken (≈ 2 L); Durst meldet sich erst
 * bei ~1–2 % Wasserverlust, und schon das senkt Konzentration und Stimmung leicht (Ganio 2011, Armstrong 2012).
 * Über Nacht gehen ~0,3–0,5 L über Atem und Haut verloren, darum morgens zuerst ein großes Glas. Die Nieren
 * schaffen höchstens ~0,8–1 L pro Stunde – lieber alle 1–2 h ein Glas als abends eine Flasche auf einmal.
 */

// Joshua sleeps ~1:00–9:00. Drink target is spread over 9–23 h (the last two hours before bed stay light, fewer night trips).
export const DAY_START_HOUR = 9;
export const DAY_END_HOUR = 23;

/**
 * Last coffee: caffeine's half-life is ~5 h; a 2023 meta-analysis (Gardiner et al., Sleep Med Rev) found a cup of coffee
 * (~100 mg) should be had at least ~8.8 h before bed to spare sleep. Bed at 1:00 → last coffee by 16:00.
 */
export const CAFFEINE_CUTOFF_HOUR = 16;

export interface HydrationNudge {
  level: "hint" | "urgent";
  text: string;
}

function fmtGap(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}` : `${m} min`;
}

/** Fluid the day should have reached by `now`, spread evenly over the waking window. */
export function expectedByNow(now: Date, targetMl: number): number {
  const hours = now.getHours() + now.getMinutes() / 60;
  const share = (hours - DAY_START_HOUR) / (DAY_END_HOUR - DAY_START_HOUR);
  return Math.round(targetMl * Math.min(1, Math.max(0, share)));
}

/** A nudge to drink, or null when everything is fine (or it's night). */
export function hydrationNudge(now: Date, lastDrinkAt: Date | null, fluidMl: number, targetMl: number): HydrationNudge | null {
  const hour = now.getHours();
  if (hour < DAY_START_HOUR || hour >= DAY_END_HOUR) return null;

  if (!lastDrinkAt || fluidMl <= 0)
    return {
      level: hour >= DAY_START_HOUR + 1 ? "urgent" : "hint",
      text: "☀️ Noch nichts getrunken. Über Nacht hast du ~0,5 L verloren – starte mit einem großen Glas Wasser.",
    };

  const gap = (now.getTime() - lastDrinkAt.getTime()) / 60000;
  const behind = expectedByNow(now, targetMl) - fluidMl;
  const behindText = behind >= 400 ? ` Du liegst ~${Math.round(behind / 50) * 50} ml hinter deinem Tagesziel.` : "";

  if (gap >= 150) return { level: "urgent", text: `💧 Seit ${fmtGap(gap)} nichts getrunken – trink jetzt ein Glas.${behindText}` };
  if (gap >= 90) return { level: "hint", text: `💧 Seit ${fmtGap(gap)} nichts getrunken – Zeit für ein Glas.${behindText}` };
  if (behind >= 600) return { level: "hint", text: `💧 ~${Math.round(behind / 50) * 50} ml hinter deinem Tagesziel – über die nächsten Stunden je ein Glas.` };
  return null;
}

/**
 * The sky over the island follows the real daylight in Berlin: sunrise and sunset are computed from the date,
 * so in November the camp is dark by late afternoon and in June the evening stays golden.
 * No three.js in here – the CSS gradient behind the canvas uses the same numbers before the 3D code has loaded.
 */

export interface Sky {
  top: string;
  bottom: string;
  /** Sun or moon light. */
  light: string;
  lightIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  /** 0 = full day … 1 = deep night (stars, fire becomes the main light). */
  night: number;
  /** Where the sun/moon stands: x −1 (east/left) … 1 (west/right), y 0 (horizon) … 1 (zenith). */
  orbX: number;
  orbY: number;
  moon: boolean;
}

const LAT = 52.52;
const LON = 13.4;

/** Sunrise, solar noon and sunset as local clock hours (accurate to a few minutes). */
export function sunTimes(date: Date): { rise: number; noon: number; set: number } {
  const start = new Date(date.getFullYear(), 0, 0);
  const n = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
  const decl = -23.44 * Math.cos(((2 * Math.PI) / 365) * (n + 10));
  const rad = Math.PI / 180;
  const cosH = Math.max(-1, Math.min(1, -Math.tan(LAT * rad) * Math.tan(decl * rad)));
  const half = Math.acos(cosH) / rad / 15; // half day length in hours
  const b = (2 * Math.PI * (n - 81)) / 364;
  const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b); // minutes
  const offset = -date.getTimezoneOffset() / 60; // 1 in winter, 2 in summer (for a device in Germany)
  const noon = 12 + (offset * 15 - LON) / 15 - eot / 60;
  return { rise: noon - half, noon, set: noon + half };
}

type Key = Omit<Sky, "orbX" | "orbY" | "moon">;

const NIGHT: Key = { top: "#050816", bottom: "#111b40", light: "#8fa8ff", lightIntensity: 0.95, hemiSky: "#3a4d88", hemiGround: "#0b0e1c", hemiIntensity: 1.15, night: 1 };
const DAWN1: Key = { top: "#1a1f55", bottom: "#7a4a7a", light: "#c8a0d0", lightIntensity: 0.95, hemiSky: "#5a5f9a", hemiGround: "#1a1626", hemiIntensity: 1.25, night: 0.6 };
const DAWN2: Key = { top: "#3a62b8", bottom: "#ffb27a", light: "#ffc59a", lightIntensity: 1.9, hemiSky: "#9ab0e0", hemiGround: "#4a3a34", hemiIntensity: 1.5, night: 0.15 };
const MORNING: Key = { top: "#3d8fe6", bottom: "#bfe3ff", light: "#fff1dc", lightIntensity: 2.7, hemiSky: "#cfe6ff", hemiGround: "#5a6a4a", hemiIntensity: 1.8, night: 0 };
const DAY: Key = { top: "#2f86ea", bottom: "#a9d8ff", light: "#ffffff", lightIntensity: 3.0, hemiSky: "#d6ecff", hemiGround: "#6a7a55", hemiIntensity: 1.9, night: 0 };
const AFTERNOON: Key = { top: "#3a7fd8", bottom: "#ffe0b0", light: "#ffe9c8", lightIntensity: 2.7, hemiSky: "#cfe0f5", hemiGround: "#6a6a4a", hemiIntensity: 1.8, night: 0 };
const SUNSET: Key = { top: "#3a3a8a", bottom: "#ff8a55", light: "#ff9a66", lightIntensity: 1.9, hemiSky: "#a08ac0", hemiGround: "#4a3038", hemiIntensity: 1.4, night: 0.25 };
const DUSK: Key = { top: "#171a4a", bottom: "#5c3a70", light: "#a090d0", lightIntensity: 0.95, hemiSky: "#4a4c8a", hemiGround: "#14121f", hemiIntensity: 1.2, night: 0.7 };

const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
function mixHex(a: string, b: string, t: number): string {
  const c = [0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function skyAt(date: Date): Sky {
  const { rise, noon, set } = sunTimes(date);
  const h = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  const keys: [number, Key][] = [
    [0, NIGHT],
    [rise - 1.3, NIGHT],
    [rise - 0.5, DAWN1],
    [rise + 0.3, DAWN2],
    [Math.min(rise + 1.6, noon - 0.2), MORNING],
    [noon, DAY],
    [Math.max(set - 1.6, noon + 0.2), AFTERNOON],
    [set - 0.3, SUNSET],
    [set + 0.5, DUSK],
    [set + 1.4, NIGHT],
    [24, NIGHT],
  ];
  let i = keys.findIndex(([at]) => at > h);
  if (i < 1) i = keys.length - 1;
  const [t0, a] = keys[i - 1];
  const [t1, b] = keys[i];
  const t = t1 > t0 ? Math.min(1, Math.max(0, (h - t0) / (t1 - t0))) : 0;
  const s = t * t * (3 - 2 * t);
  const num = (k: "lightIntensity" | "hemiIntensity" | "night") => a[k] + (b[k] - a[k]) * s;

  // Sun by day, moon by night – both travel left → right in an arc.
  const day = h >= rise && h <= set;
  let p: number;
  if (day) p = (h - rise) / (set - rise);
  else {
    const nightLen = 24 - (set - rise);
    p = ((h > set ? h - set : h + 24 - set) / nightLen) % 1;
  }
  return {
    top: mixHex(a.top, b.top, s),
    bottom: mixHex(a.bottom, b.bottom, s),
    light: mixHex(a.light, b.light, s),
    lightIntensity: num("lightIntensity"),
    hemiSky: mixHex(a.hemiSky, b.hemiSky, s),
    hemiGround: mixHex(a.hemiGround, b.hemiGround, s),
    hemiIntensity: num("hemiIntensity"),
    night: num("night"),
    orbX: -0.85 + 1.7 * p,
    orbY: Math.sin(Math.PI * p),
    moon: !day,
  };
}

/** Short German label for the HUD, e.g. "Sonnenuntergang 16:08". */
export function daylightLabel(date: Date): string {
  const { rise, set } = sunTimes(date);
  const h = date.getHours() + date.getMinutes() / 60;
  const fmt = (x: number) => `${Math.floor(x)}:${String(Math.round((x % 1) * 60) % 60).padStart(2, "0")}`;
  if (h < rise) return `Sonnenaufgang ${fmt(rise)}`;
  if (h < set) return `Sonne bis ${fmt(set)}`;
  return `Sonnenaufgang ${fmt(rise)}`;
}

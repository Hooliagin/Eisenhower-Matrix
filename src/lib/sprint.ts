/**
 * Sprint timing helpers (pure logic, testable without a browser).
 *
 * Start: the phone is held still in the set position; `MotionStart` learns that stillness and reports the moment the
 * acceleration clearly changes (first step). The reported time is backdated to where the movement began, not where it
 * crossed the hard threshold.
 * Finish: `GpsRun` measures the distance from the averaged start position and interpolates the moment the target
 * distance is crossed between two GPS fixes. Phone GPS is only accurate to a few metres, so this is ± a few tenths.
 */

export class MotionStart {
  private n = 0;
  private mean = 0;
  private m2 = 0;
  private recent: [number, number][] = []; // [t, |a| deviation]
  startedAt: number | null = null;

  /** Feed |acceleration| (m/s², any orientation) at time t (ms). `calibrating` = athlete is still in the set position. */
  push(mag: number, t: number, calibrating: boolean): number | null {
    if (calibrating || this.n < 10) {
      this.n++;
      const d = mag - this.mean;
      this.mean += d / this.n;
      this.m2 += d * (mag - this.mean);
      return null;
    }
    if (this.startedAt != null) return this.startedAt;
    const sd = Math.sqrt(this.m2 / Math.max(1, this.n - 1));
    const dev = Math.abs(mag - this.mean);
    this.recent.push([t, dev]);
    while (this.recent.length && t - this.recent[0][0] > 400) this.recent.shift();
    // Hard trigger: a real push-off is several m/s², hand tremor is a few tenths.
    if (dev > Math.max(2.5, 8 * sd)) {
      const soft = Math.max(0.8, 4 * sd);
      // Backdate to the start of the run of samples above the soft threshold.
      let start = t;
      for (let i = this.recent.length - 1; i >= 0 && this.recent[i][1] > soft; i--) start = this.recent[i][0];
      this.startedAt = start;
      return start;
    }
    return null;
  }

  /** Movement before the gun? (used for false starts while waiting for the signal) */
  moved(mag: number): boolean {
    if (this.n < 10) return false;
    const sd = Math.sqrt(this.m2 / Math.max(1, this.n - 1));
    return Math.abs(mag - this.mean) > Math.max(2.5, 8 * sd);
  }
}

export interface Fix {
  lat: number;
  lon: number;
  accuracy: number; // m
  t: number; // ms
  speed?: number | null; // m/s, if the device reports it
}

export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export class GpsRun {
  private origin: { lat: number; lon: number } | null = null;
  private startFixes: Fix[] = [];
  private last: { t: number; d: number } | null = null;
  distance = 0;
  topSpeed = 0; // m/s
  finishedAt: number | null = null;

  constructor(readonly target: number) {}

  /** Before the start: collect fixes to average the start position (best accuracy wins). */
  addStartFix(f: Fix) {
    this.startFixes.push(f);
    if (this.startFixes.length > 10) this.startFixes.shift();
  }

  get startAccuracy(): number | null {
    return this.startFixes.length ? Math.min(...this.startFixes.map((f) => f.accuracy)) : null;
  }

  /** Lock the start position at the moment the run begins. */
  begin(t: number) {
    const good = [...this.startFixes].sort((a, b) => a.accuracy - b.accuracy).slice(0, 3);
    if (!good.length) return;
    const w = good.map((f) => 1 / Math.max(1, f.accuracy) ** 2);
    const sw = w.reduce((a, b) => a + b, 0);
    this.origin = {
      lat: good.reduce((s, f, i) => s + f.lat * w[i], 0) / sw,
      lon: good.reduce((s, f, i) => s + f.lon * w[i], 0) / sw,
    };
    this.last = { t, d: 0 };
  }

  /** During the run. Returns the interpolated finish time once the target distance is crossed. */
  addFix(f: Fix): number | null {
    if (!this.origin || !this.last || this.finishedAt != null) return this.finishedAt;
    const d = distanceM(this.origin, f);
    const dt = (f.t - this.last.t) / 1000;
    if (dt > 0) {
      const v = f.speed ?? (d - this.last.d) / dt;
      if (v > this.topSpeed && v < 13) this.topSpeed = v; // > 13 m/s (47 km/h) is a GPS jump
    }
    if (d >= this.target && this.last.d < this.target) {
      const frac = (this.target - this.last.d) / Math.max(0.01, d - this.last.d);
      this.finishedAt = this.last.t + frac * (f.t - this.last.t);
    }
    this.distance = d;
    this.last = { t: f.t, d };
    return this.finishedAt;
  }
}

export const fmtSprint = (s: number) => s.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

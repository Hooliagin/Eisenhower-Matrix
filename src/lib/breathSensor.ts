/**
 * Breath detection from the phone's motion sensor while it lies on the belly.
 *
 * The belly lifts and tilts the phone a little with every breath. We band-pass each accelerometer axis
 * (≈0.05–0.8 Hz: removes posture drift and sensor jitter; breathing stays below ~40/min), follow the axis with the most breathing energy and
 * derive from it: the live signal, the breathing rate, and "breathing resumed" after a breath hold.
 * The sign (does "up" mean inhale?) is unknown, so everything here is sign-independent.
 */
export class BreathSensor {
  private fast = [0, 0, 0];
  private slow = [0, 0, 0];
  private energy = [0, 0, 0];
  private axis = 2;
  private lastAxisPick = 0;
  private started = 0;
  private lastT = 0;
  private prevT = 0;
  /** recent band-passed samples of the chosen axis: [time ms, value] */
  readonly history: [number, number][] = [];
  private peaks: number[] = [];
  private lastExtreme: { t: number; v: number; kind: "max" | "min" } | null = null;
  private holdRef: { mean: number; sd: number; n: number; m2: number; since: number } | null = null;
  private amplitude = 0; // typical peak-to-peak of recent breaths
  private noise = 0; // mean square of the high-frequency residual (sensor jitter) on the chosen axis
  private smooth = 0; // extra-smoothed signal used only for counting breaths
  private noiseGain = 0; // how much jitter survives both low-pass stages (depends on sample rate)
  private hitSince = 0; // start of the current run of samples outside the still band (0 = none)
  private hitCount = 0;

  /** Feed one sample (m/s², accelerationIncludingGravity) at time `t` (ms). */
  push(x: number, y: number, z: number, t: number) {
    if (!this.started) {
      this.started = t;
      this.fast = [x, y, z];
      this.slow = [x, y, z];
      this.lastT = t;
      return;
    }
    const dt = Math.min(0.2, Math.max(0.001, (t - this.lastT) / 1000));
    this.prevT = this.lastT;
    this.lastT = t;
    const aFast = 1 - Math.exp(-2 * Math.PI * 0.8 * dt);
    const aSlow = 1 - Math.exp(-2 * Math.PI * 0.05 * dt);
    const v = [x, y, z];
    const bp = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      this.fast[i] += aFast * (v[i] - this.fast[i]);
      this.slow[i] += aSlow * (v[i] - this.slow[i]);
      bp[i] = this.fast[i] - this.slow[i];
      this.energy[i] += (1 - Math.exp(-dt / 8)) * (bp[i] * bp[i] - this.energy[i]);
    }
    // Stick to one axis; re-check every 10 s so the signal doesn't jump around.
    if (t - this.lastAxisPick > 10_000) {
      this.axis = this.energy.indexOf(Math.max(...this.energy));
      this.lastAxisPick = t;
    }
    const s = bp[this.axis];
    const residual = v[this.axis] - this.fast[this.axis];
    this.noise += (1 - Math.exp(-dt / 5)) * (residual * residual - this.noise);
    // Second low-pass (0.5 Hz ≈ 30 breaths/min) just for peak counting; track how much jitter it lets through.
    const aSmooth = 1 - Math.exp(-2 * Math.PI * 0.5 * dt);
    this.smooth += aSmooth * (s - this.smooth);
    this.noiseGain = Math.sqrt((aFast / (2 - aFast)) * (aSmooth / (2 - aSmooth)));
    this.history.push([t, s]);
    while (this.history.length && t - this.history[0][0] > 60_000) this.history.shift();
    this.trackExtremes(t, this.smooth);
    if (this.holdRef) this.trackHold(t, this.smooth);
  }

  /** Peak/trough detection with hysteresis relative to the recent amplitude. */
  private trackExtremes(t: number, s: number) {
    // A swing only counts as a breath if it clearly exceeds the jitter and isn't tiny next to recent breaths.
    const jitter = Math.sqrt(this.noise) * this.noiseGain; // std of the jitter left in the smoothed signal
    const minSwing = Math.max(this.amplitude * 0.4, jitter * 8, 0.002);
    const e = this.lastExtreme;
    if (!e) {
      this.lastExtreme = { t, v: s, kind: "max" };
      return;
    }
    if (e.kind === "max") {
      if (s > e.v) Object.assign(e, { t, v: s });
      else if (e.v - s > minSwing) {
        // refractory: at most one breath per second
        if (!this.peaks.length || e.t - this.peaks[this.peaks.length - 1] > 1000) this.peaks.push(e.t);
        this.lastExtreme = { t, v: s, kind: "min" };
        this.learnAmplitude(e.v - s);
      }
    } else {
      if (s < e.v) Object.assign(e, { t, v: s });
      else if (s - e.v > minSwing) {
        this.lastExtreme = { t, v: s, kind: "max" };
        this.learnAmplitude(s - e.v);
      }
    }
    while (this.peaks.length && t - this.peaks[0] > 60_000) this.peaks.shift();
  }

  private learnAmplitude(swing: number) {
    // Small wiggles between real breaths shouldn't drag the reference down.
    if (this.amplitude && swing < this.amplitude * 0.5) return;
    this.amplitude = this.amplitude ? this.amplitude * 0.8 + swing * 0.2 : swing;
  }

  /** Breaths per minute from the peaks of the last 60 s (slow breathing needs the long window); null until 3 breaths. */
  rate(now: number): number | null {
    const recent = this.peaks.filter((p) => now - p < 60_000);
    if (recent.length < 3) return null;
    const span = (recent[recent.length - 1] - recent[0]) / 1000;
    return span > 0 ? ((recent.length - 1) / span) * 60 : null;
  }

  /** Call when a breath hold starts; `breathingResumed` then watches for the first real movement. */
  startHold(t: number) {
    this.holdRef = { mean: 0, sd: 0, n: 0, m2: 0, since: t };
    this.hitSince = 0;
    this.hitCount = 0;
  }

  stopHold() {
    this.holdRef = null;
  }

  private trackHold(t: number, s: number) {
    const h = this.holdRef!;
    // Let the filters settle from the last exhale (1.5 s), then learn the "still" level until 4 s (Welford mean/variance).
    if (t - h.since < 1500) return;
    if (t - h.since < 4000) {
      h.n++;
      const d = s - h.mean;
      h.mean += d / h.n;
      h.m2 += d * (s - h.mean);
      h.sd = h.n > 1 ? Math.sqrt(h.m2 / (h.n - 1)) : 0;
      return;
    }
    const jitter = Math.sqrt(this.noise) * this.noiseGain;
    const threshold = Math.max(6 * h.sd, 8 * jitter, this.amplitude * 0.3, 0.004);
    if (Math.abs(s - h.mean) > threshold) {
      if (!this.hitSince) this.hitSince = t;
      this.hitCount++;
    } else {
      this.hitSince = 0;
      this.hitCount = 0;
      // Follow slow drift of the still level (filters settling, posture), but never the inhale itself.
      h.mean += (1 - Math.exp(-(t - this.prevT) / 4000)) * (s - h.mean);
    }
  }

  /** True once the signal clearly left the still level for ~0.3 s in a row (≈ first inhale), independent of sample rate. */
  breathingResumed(): boolean {
    return !!this.holdRef && this.hitCount >= 3 && this.lastT - this.hitSince >= 300;
  }
}

type MotionPermission = "granted" | "denied" | "unsupported";

/** iOS asks for motion access via a user gesture; other platforms just work (or have no sensor). */
export async function requestMotionPermission(): Promise<MotionPermission> {
  const DM = (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } }).DeviceMotionEvent;
  if (!DM) return "unsupported";
  if (typeof DM.requestPermission === "function") {
    try {
      return (await DM.requestPermission()) === "granted" ? "granted" : "denied";
    } catch {
      return "denied";
    }
  }
  return "granted";
}

/** Subscribe a sensor to device motion; returns an unsubscribe function. */
export function listenMotion(sensor: BreathSensor): () => void {
  const onMotion = (e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity;
    if (a?.x == null || a.y == null || a.z == null) return;
    sensor.push(a.x, a.y, a.z, Date.now());
  };
  window.addEventListener("devicemotion", onMotion);
  return () => window.removeEventListener("devicemotion", onMotion);
}

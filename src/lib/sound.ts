let audio: AudioContext | null = null;

/** Must be called from a user gesture (iOS only unlocks audio there). */
export function unlockAudio() {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    /* no audio available */
  }
}

/** Play tones: [frequency Hz, start offset s, duration s]. */
export function tones(list: [number, number, number][], volume = 0.3) {
  if (!audio) return;
  const now = audio.currentTime;
  for (const [freq, at, dur] of list) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, now + at);
    gain.gain.exponentialRampToValueAtTime(0.001, now + at + dur);
    osc.connect(gain).connect(audio.destination);
    osc.start(now + at);
    osc.stop(now + at + dur);
  }
}

export const SOUNDS = {
  /** Rest timer finished */
  restDone: () => tones([[880, 0, 0.2], [880, 0.25, 0.2], [880, 0.5, 0.2]]),
  /** Round starts: one long high tone */
  roundStart: () => tones([[1046, 0, 0.7]], 0.4),
  /** Round over: boxing-bell style triple */
  roundEnd: () => tones([[660, 0, 0.35], [660, 0.4, 0.35], [660, 0.8, 0.5]], 0.4),
  /** 10 seconds left in a round: two quick clicks */
  tenSeconds: () => tones([[1500, 0, 0.06], [1500, 0.15, 0.06]], 0.35),
  /** Countdown tick (last 3 s of a pause) */
  tick: () => tones([[1200, 0, 0.08]], 0.3),
  /** Meditation: soft low gong */
  gong: () => tones([[196, 0, 2.5], [392, 0, 1.8], [588, 0, 1.2]], 0.25),
  /** Soft tick for a calm countdown */
  softTick: () => tones([[600, 0, 0.12]], 0.12),
  /** Whole workout done */
  finished: () => tones([[523, 0, 0.2], [659, 0.2, 0.2], [784, 0.4, 0.2], [1046, 0.6, 0.6]], 0.4),
};

export type NoiseKind = "white" | "pink" | "brown" | "rain" | "drone";

/**
 * Seamlessly looping noise generated in the browser (no audio files).
 * The buffer edges are cross-faded so the loop point is inaudible.
 * Returns a function that fades the noise out and stops it.
 */
export function startNoise(kind: NoiseKind, volume: number): { stop: () => void; setVolume: (v: number) => void } {
  if (!audio) return { stop: () => {}, setVolume: () => {} };
  const ctx = audio;
  const seconds = 30;
  const fade = Math.floor(ctx.sampleRate * 2);
  const n = ctx.sampleRate * seconds;
  const raw = new Float32Array(n + fade);

  if (kind === "white") {
    // scaled to roughly the same loudness (RMS ≈ 0.2) as pink and brown
    for (let i = 0; i < raw.length; i++) raw[i] = (Math.random() * 2 - 1) * 0.35;
  } else if (kind === "pink") {
    // Paul Kellet's refined pink-noise filter
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < raw.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      raw[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else if (kind === "rain") {
    // Soft pink-ish bed plus thousands of tiny droplet ticks (short, bright, quickly decaying bursts)
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < raw.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      raw[i] = (b0 + b1 + b2 + w * 0.1848) * 0.045;
    }
    const drops = Math.floor((raw.length / ctx.sampleRate) * 60);
    for (let d = 0; d < drops; d++) {
      const at = Math.floor(Math.random() * (raw.length - 2000));
      const amp = 0.05 + Math.random() * 0.25;
      const len = 200 + Math.floor(Math.random() * 1200);
      let prev = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        const hp = w - prev; // crude high-pass for a crisp tick
        prev = w;
        raw[at + i] += hp * amp * Math.exp((-6 * i) / len);
      }
    }
    for (let i = 0; i < raw.length; i++) raw[i] *= 2.2; // level to RMS ≈ 0.2 like the other noises
  } else {
    // Brown noise: leaky integration of white noise (also the bed under the drone)
    let last = 0;
    for (let i = 0; i < raw.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      raw[i] = last * (kind === "drone" ? 1.8 : 3.5);
    }
  }

  const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = raw[i];
  // Blend the tail into the head with an equal-power curve: the two noise pieces are uncorrelated, so a
  // linear cross-fade would dip ~3 dB mid-way (an audible "breathing" every loop); sin/cos keeps power constant.
  for (let i = 0; i < fade; i++) {
    const k = (i / fade) * (Math.PI / 2);
    data[i] = raw[i] * Math.sin(k) + raw[n + i] * Math.cos(k);
  }

  if (kind === "drone") {
    // Deep hum: low partials whose frequencies complete whole cycles in the buffer, so they loop seamlessly
    // (added after the cross-fade). 55 Hz vs 55.1 Hz beats slowly, once every 10 s.
    const partials: [number, number][] = [[55, 0.17], [55.1, 0.14], [110, 0.08], [82.5, 0.055], [165, 0.025]];
    for (let i = 0; i < n; i++) {
      const t = i / ctx.sampleRate;
      let v = 0;
      for (const [f, a] of partials) v += a * Math.sin(2 * Math.PI * f * t);
      data[i] += v;
    }
  }

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 2); // gentle fade-in
  src.connect(gain).connect(ctx.destination);
  src.start();

  return {
    stop: () => {
      const t = ctx.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(0, t + 1.5);
      src.stop(t + 1.6);
    },
    setVolume: (v: number) => gain.gain.setTargetAtTime(v, ctx.currentTime, 0.1),
  };
}

/** A synthetic breath: filtered noise that swells on the inhale and falls away on the exhale. */
export function breathSound(direction: "in" | "out", seconds: number, volume = 0.25) {
  if (!audio || seconds <= 0) return;
  const ctx = audio;
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 0.8;
  const gain = ctx.createGain();
  const t = ctx.currentTime;
  const [f0, f1] = direction === "in" ? [500, 1400] : [1200, 400];
  filter.frequency.setValueAtTime(f0, t);
  filter.frequency.exponentialRampToValueAtTime(f1, t + seconds);
  gain.gain.setValueAtTime(0.0001, t);
  if (direction === "in") {
    gain.gain.exponentialRampToValueAtTime(volume, t + seconds * 0.8);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  } else {
    gain.gain.exponentialRampToValueAtTime(volume, t + Math.min(0.3, seconds * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  }
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(t);
  src.stop(t + seconds + 0.05);
}

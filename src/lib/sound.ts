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

export type NoiseKind = "white" | "pink" | "brown";

/**
 * Seamlessly looping noise generated in the browser (no audio files).
 * The buffer edges are cross-faded so the loop point is inaudible.
 * Returns a function that fades the noise out and stops it.
 */
export function startNoise(kind: NoiseKind, volume: number): { stop: () => void; setVolume: (v: number) => void } {
  if (!audio) return { stop: () => {}, setVolume: () => {} };
  const ctx = audio;
  const seconds = 8;
  const fade = Math.floor(ctx.sampleRate * 0.5);
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
  } else {
    // Brown noise: leaky integration of white noise
    let last = 0;
    for (let i = 0; i < raw.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      raw[i] = last * 3.5;
    }
  }

  const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = raw[i];
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    data[i] = raw[i] * k + raw[n + i] * (1 - k); // blend the tail into the head
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

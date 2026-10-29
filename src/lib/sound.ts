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

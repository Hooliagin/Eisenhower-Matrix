/** Tiny event line between the app and the 3D world (kept free of three.js so anything may import it). */
export type WorldEvent =
  | { type: "celebrate"; color: string } // XP gained: the hero jumps, sparks in the attribute's colour
  | { type: "levelup" } // pillar of light
  | { type: "pet" }; // Pouchi gets some love

const subs = new Set<(e: WorldEvent) => void>();

export const worldBus = {
  emit(e: WorldEvent) {
    subs.forEach((f) => f(e));
  },
  on(cb: (e: WorldEvent) => void): () => void {
    subs.add(cb);
    return () => void subs.delete(cb);
  },
};

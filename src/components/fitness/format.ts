import type { Metric, SetLog } from "../../lib/types";

export function fmtSet(s: Pick<SetLog, "weight" | "reps" | "seconds" | "meters">, metric: Metric): string {
  const w = s.weight != null ? `${Number(s.weight)}` : "BW";
  if (metric === "weight_distance") return `${w}×${s.meters ?? "?"}m`;
  if (metric === "weight_time") return `${w}×${s.seconds ?? "?"}s`;
  return `${w}×${s.reps ?? "?"}`;
}

export const SECOND_FIELD: Record<Metric, { key: "reps" | "seconds" | "meters"; label: string }> = {
  weight_reps: { key: "reps", label: "Wdh" },
  weight_time: { key: "seconds", label: "Sek" },
  weight_distance: { key: "meters", label: "Meter" },
};

/** Epley estimate; bodyweight sets count reps only. */
export function e1rm(weight: number | null, reps: number | null): number {
  if (!reps) return 0;
  if (!weight) return reps;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

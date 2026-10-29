export type Quadrant = "inbox" | "do" | "schedule" | "delegate" | "eliminate";

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  quadrant: Quadrant;
  position: number;
  due_date: string | null;
  done: boolean;
  done_at: string | null;
  source: "app" | "voice" | "claude";
  created_at: string;
}

export interface Habit {
  id: string;
  name: string;
  emoji: string | null;
  target_per_week: number;
  position: number;
  active: boolean;
}

export interface HabitLog {
  habit_id: string;
  log_date: string;
}

export type Metric = "weight_reps" | "weight_time" | "weight_distance";

export interface Exercise {
  id: string;
  name: string;
  metric: Metric;
  notes: string | null;
}

export interface TemplateExercise {
  id: string;
  template_id: string;
  exercise_id: string;
  position: number;
  target_sets: number;
  target_reps: string | null;
  rest_seconds: number;
  superset_group: string | null;
  optional: boolean;
  notes: string | null;
  exercise: Exercise;
}

export interface WorkoutTemplate {
  id: string;
  code: string;
  name: string;
  focus: string | null;
  times_per_week: number;
  position: number;
  template_exercises: TemplateExercise[];
}

export interface WorkoutSession {
  id: string;
  template_id: string | null;
  session_date: string;
  started_at: string;
  finished_at: string | null;
  notes: string | null;
}

export interface SetLog {
  id: string;
  session_id: string;
  exercise_id: string;
  set_number: number;
  weight: number | null;
  reps: number | null;
  seconds: number | null;
  meters: number | null;
  created_at: string;
}

export const QUADRANTS: Record<Exclude<Quadrant, "inbox">, { label: string; hint: string; color: string; ring: string }> = {
  do: { label: "Sofort erledigen", hint: "dringend & wichtig", color: "text-red-400", ring: "border-red-500/40" },
  schedule: { label: "Einplanen", hint: "wichtig, nicht dringend", color: "text-blue-400", ring: "border-blue-500/40" },
  delegate: { label: "Delegieren", hint: "dringend, nicht wichtig", color: "text-amber-400", ring: "border-amber-500/40" },
  eliminate: { label: "Weglassen", hint: "weder noch", color: "text-slate-400", ring: "border-slate-500/40" },
};

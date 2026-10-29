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
  estimate_minutes: number | null;
  actual_minutes: number | null;
  started_at: string | null;
  planned_start: string | null;
  project_id?: string | null;
  routine_id?: string | null;
  attribute?: string | null;
  element?: "feuer" | "wasser" | "erde" | "luft" | null;
  timer?: { rounds: number; work: number; rest: number; prep?: number; style?: "boxing" | "calm" | "plain" } | null;
  anytime?: boolean;
  // Computed by the tasks_planned view (learning)
  planned_minutes?: number;
  history_samples?: number | null;
  estimate_factor?: number;
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

export interface ShoppingItem {
  id: string;
  name: string;
  done: boolean;
  position: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  notes: string | null;
  source: "app" | "claude";
  kind: "termin" | "dienst";
  ride_km_each_way: number | null;
  shift_hours: number | null;
}

export interface Project {
  id: string;
  name: string;
  emoji: string | null;
  description: string | null;
  position: number;
  archived: boolean;
  parent_id: string | null;
  kind: "default" | "books";
}

export interface Followup {
  id: string;
  project_id: string | null;
  person: string;
  topic: string;
  status: "todo" | "waiting" | "done";
  last_contact: string | null;
  follow_up_on: string | null;
  wait_days: number;
  repeat_days: number | null;
  draft: string | null;
  dictation: string | null;
  notes: string | null;
  source: "app" | "claude";
  updated_at: string;
}

export type BookStatus = "reading" | "want" | "to_buy" | "idea" | "done";

export interface Book {
  id: string;
  title: string;
  author: string | null;
  field: string;
  status: BookStatus;
  progress_pct: number | null;
  notes: string | null;
  position: number;
  finished_at: string | null;
}

export interface ReadingLog {
  id: string;
  log_date: string;
  minutes: number;
  book_id: string | null;
}

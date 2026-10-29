import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import type { Book, CalendarEvent, Followup, Project, Quadrant, ReadingLog, ShoppingItem, Task, WorkoutSession, WorkoutTemplate } from "./types";
import type { AttrSummary, CharacterStat } from "./character";
import { addDays, isoDate, weekStart } from "./dates";

/** Refetch on mount, when the tab regains focus, and on realtime changes to `tables`. */
function useLive<T>(load: () => Promise<T>, tables: string[], initial: T) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  loadRef.current = load;
  const key = tables.join("-");

  const refresh = useCallback(async () => {
    try {
      setData(await loadRef.current());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onFocus);
    const channel = supabase.channel(`live-${key}-${Math.random().toString(36).slice(2)}`);
    key.split("-").forEach((table) =>
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => void refresh()),
    );
    channel.subscribe();
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      void supabase.removeChannel(channel);
    };
  }, [refresh, key]);

  return { data, setData, loading, refresh };
}

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

// ---------- Tasks ----------

export function useTasks() {
  return useLive<Task[]>(
    async () => {
      // Open tasks plus everything finished in the last 7 days.
      const since = addDays(new Date(), -7).toISOString();
      return must(
        await supabase
          .from("tasks_planned")
          .select("*")
          .or(`done.eq.false,done_at.gte.${since}`)
          .order("position"),
      );
    },
    ["tasks"],
    [],
  );
}

export async function createTasks(
  rows: { title: string; quadrant: Quadrant; source?: Task["source"]; estimate_minutes?: number | null; due_date?: string | null; project_id?: string | null }[],
) {
  const base = Date.now() / 1000;
  must(await supabase.from("tasks").insert(rows.map((r, i) => ({ ...r, position: base + i }))));
}

export async function updateTask(id: string, patch: Partial<Task>) {
  if (patch.done !== undefined) patch.done_at = patch.done ? new Date().toISOString() : null;
  must(await supabase.from("tasks").update(patch).eq("id", id));
}

export async function deleteTask(id: string) {
  must(await supabase.from("tasks").delete().eq("id", id));
}

// ---------- Shopping list ----------

export function useShopping() {
  return useLive<ShoppingItem[]>(
    async () => must(await supabase.from("shopping_items").select("*").order("done").order("position")),
    ["shopping_items"],
    [],
  );
}

// ---------- Projects & follow-ups ----------

export function useProjects() {
  return useLive<{ projects: Project[]; followups: Followup[]; tasks: Task[] }>(
    async () => {
      const since = addDays(new Date(), -14).toISOString();
      const [p, f, t] = await Promise.all([
        supabase.from("projects").select("*").eq("archived", false).order("position"),
        supabase.from("followups").select("*").order("follow_up_on", { nullsFirst: true }),
        supabase.from("tasks_planned").select("*").not("project_id", "is", null).or(`done.eq.false,done_at.gte.${since}`).order("position"),
      ]);
      return { projects: must(p), followups: must(f), tasks: must(t) };
    },
    ["projects", "followups", "tasks"],
    { projects: [], followups: [], tasks: [] },
  );
}

/** Open follow-ups whose date has come (or that have none yet). */
export function isDue(f: Followup, today = isoDate()): boolean {
  return f.status !== "done" && (!f.follow_up_on || f.follow_up_on <= today);
}

export async function updateFollowup(id: string, patch: Partial<Followup>) {
  must(await supabase.from("followups").update(patch).eq("id", id));
}

/** Message sent: wait for an answer, nudge again after wait_days. */
export function sentPatch(f: Followup): Partial<Followup> {
  const today = new Date();
  return { status: "waiting", last_contact: isoDate(today), follow_up_on: isoDate(addDays(today, f.wait_days)), draft: null };
}

/** Answer received / reminder handled: done, or re-arm if it repeats. */
export function resolvedPatch(f: Followup): Partial<Followup> {
  const today = new Date();
  return f.repeat_days
    ? { status: "todo", last_contact: isoDate(today), follow_up_on: isoDate(addDays(today, f.repeat_days)) }
    : { status: "done", last_contact: isoDate(today) };
}

// ---------- Character ----------

export function useCharacter() {
  return useLive<{ summary: AttrSummary[]; stats: CharacterStat[] }>(
    async () => {
      const [s, c] = await Promise.all([
        supabase.from("character_summary").select("*"),
        supabase.from("character_stats").select("*").order("attribute").order("position"),
      ]);
      return { summary: must(s), stats: must(c) };
    },
    ["tasks", "reading_log", "workout_sessions", "character_stats"],
    { summary: [], stats: [] },
  );
}

// ---------- Reading ----------

export function useBooks() {
  return useLive<{ books: Book[]; log: ReadingLog[] }>(
    async () => {
      const from = isoDate(addDays(weekStart(), -7 * 7));
      const [b, l] = await Promise.all([
        supabase.from("books").select("*").order("field").order("position"),
        supabase.from("reading_log").select("id, log_date, minutes, book_id").gte("log_date", from).order("log_date"),
      ]);
      return { books: must(b), log: must(l) };
    },
    ["books", "reading_log"],
    { books: [], log: [] },
  );
}

export function minutesThisWeek(log: ReadingLog[]): number {
  const ws = isoDate(weekStart());
  return log.filter((l) => l.log_date >= ws).reduce((sum, l) => sum + l.minutes, 0);
}

export async function logReading(minutes: number, bookId: string | null) {
  must(await supabase.from("reading_log").insert({ minutes, book_id: bookId, log_date: isoDate() }));
}

export async function updateBook(id: string, patch: Partial<Book>) {
  if (patch.status === "done") {
    patch.progress_pct = 100;
    patch.finished_at = isoDate();
  }
  must(await supabase.from("books").update(patch).eq("id", id));
}

// ---------- Calendar ----------

/** Open tasks with a deadline plus events, from `from` onwards. */
export function useCalendar(from: string) {
  return useLive<{ events: CalendarEvent[]; deadlines: Task[] }>(
    async () => {
      const [e, t] = await Promise.all([
        supabase.from("events").select("*").gte("event_date", from).order("event_date").order("start_time"),
        supabase.from("tasks").select("*").not("due_date", "is", null).gte("due_date", from).order("due_date"),
      ]);
      return { events: must(e), deadlines: must(t) };
    },
    ["events", "tasks"],
    { events: [], deadlines: [] },
  );
}

export async function createEvent(e: Pick<CalendarEvent, "title" | "event_date" | "start_time">) {
  must(await supabase.from("events").insert(e));
}

export async function deleteEvent(id: string) {
  must(await supabase.from("events").delete().eq("id", id));
}

// ---------- Fitness ----------

export function useTemplates() {
  return useLive<WorkoutTemplate[]>(
    async () => {
      const rows = must(
        await supabase
          .from("workout_templates")
          .select("*, template_exercises(*, exercise:exercises(*))")
          .eq("active", true)
          .order("position"),
      ) as WorkoutTemplate[];
      rows.forEach((t) => t.template_exercises.sort((a, b) => a.position - b.position));
      return rows;
    },
    ["workout_templates", "template_exercises", "exercises"],
    [],
  );
}

export function useSessions() {
  return useLive<WorkoutSession[]>(
    async () =>
      must(
        await supabase
          .from("workout_sessions")
          .select("*")
          .order("session_date", { ascending: false })
          .order("started_at", { ascending: false })
          .limit(60),
      ),
    ["workout_sessions"],
    [],
  );
}

/** Which workout is next: the one furthest behind its weekly target, ties broken by longest ago. */
export function suggestTemplate(templates: WorkoutTemplate[], sessions: WorkoutSession[]) {
  const ws = isoDate(weekStart());
  const scored = templates.map((t) => {
    const mine = sessions.filter((s) => s.template_id === t.id);
    const thisWeek = mine.filter((s) => s.session_date >= ws).length;
    const last = mine[0]?.session_date ?? "0000-00-00";
    return { t, thisWeek, remaining: t.times_per_week - thisWeek, last };
  });
  const open = scored.filter((s) => s.remaining > 0);
  const pool = open.length ? open : scored;
  pool.sort((a, b) => b.remaining - a.remaining || a.last.localeCompare(b.last));
  return { next: pool[0]?.t ?? null, weekly: scored };
}

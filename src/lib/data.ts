import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import type { CalendarEvent, Quadrant, ShoppingItem, Task, WorkoutSession, WorkoutTemplate } from "./types";
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
  rows: { title: string; quadrant: Quadrant; source?: Task["source"]; estimate_minutes?: number | null; due_date?: string | null }[],
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

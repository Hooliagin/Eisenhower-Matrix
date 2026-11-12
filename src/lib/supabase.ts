import { createClient } from "@supabase/supabase-js";
import { invalidateSoon } from "./live";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/** Server functions that write: which tables they touch (so the cache knows what to refetch). */
const RPC_TABLES: Record<string, string[]> = {
  spawn_routine_tasks: ["tasks"],
  autofinish_sessions: ["workout_sessions"],
};

/**
 * Every write the app makes (insert/update/delete/rpc) marks the affected table as stale right after it succeeded.
 * That way all views refresh immediately – realtime is only needed for changes made elsewhere (Claude in the chat).
 */
const trackingFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  try {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method !== "GET" && method !== "HEAD" && res.ok) {
      const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const m = new URL(href).pathname.match(/\/rest\/v1\/(rpc\/)?([A-Za-z0-9_]+)/);
      if (m) (m[1] ? (RPC_TABLES[m[2]] ?? []) : [m[2]]).forEach((t) => invalidateSoon(t, 60));
    }
  } catch {
    /* never let cache bookkeeping break a request */
  }
  return res;
};

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
  global: { fetch: trackingFetch },
});

let realtime: ReturnType<typeof supabase.channel> | null = null;

/** One realtime channel for the whole app: any change in the database refreshes the queries that read that table. */
export function connectRealtime() {
  if (realtime) return;
  realtime = supabase
    .channel("live-all")
    .on("postgres_changes", { event: "*", schema: "public" }, (payload) => invalidateSoon(payload.table))
    .subscribe();
}

export function disconnectRealtime() {
  if (realtime) void supabase.removeChannel(realtime);
  realtime = null;
}

/**
 * Run a query in the background. Supabase query builders are lazy – they only hit the
 * network once awaited/then'd – so `void supabase.from(...).update(...)` silently does nothing.
 */
export function fire(query: PromiseLike<{ error: { message: string } | null }>) {
  query.then(({ error }) => error && console.error(error.message), (e) => console.error(e));
}

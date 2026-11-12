import { useCallback, useEffect, useSyncExternalStore } from "react";

/**
 * Shared query cache ("stale-while-revalidate") behind every data hook.
 *
 * - One entry per key, shared by all components → switching tabs shows data instantly instead of refetching into a blank page.
 * - The last result is kept in localStorage, so a cold start paints yesterday's state immediately and refreshes in the background.
 * - One realtime channel for the whole app (see `connectRealtime` in supabase.ts) calls `invalidate(table)`; every write the
 *   app itself makes invalidates too (fetch wrapper in supabase.ts), so the UI updates even without realtime.
 * - Optimistic `setData` wins over a fetch that was already on its way (no flicker back to the old state).
 */

interface Entry<T = unknown> {
  data: T | undefined;
  fetchedAt: number; // 0 = never fetched in this session (data may still come from storage)
  promise: Promise<void> | null;
  load: (() => Promise<T>) | null;
  tables: string[];
  subs: Set<() => void>;
  seq: number; // bumped by local writes; a fetch started before the latest write is thrown away
  persist: boolean;
  dirty: boolean; // invalidated while nobody was listening
}

const PREFIX = "q:";
const MAX_PERSIST_CHARS = 250_000;
const entries = new Map<string, Entry>();

function readStored<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as { d: T }).d : undefined;
  } catch {
    return undefined;
  }
}

function writeStored(key: string, data: unknown) {
  try {
    const raw = JSON.stringify({ t: Date.now(), d: data });
    if (raw.length <= MAX_PERSIST_CHARS) localStorage.setItem(PREFIX + key, raw);
  } catch {
    /* storage full or unavailable – the cache still works in memory */
  }
}

/** Dated keys (one per day) would pile up: drop snapshots nobody has refreshed for a few days. */
function pruneStored(maxAgeMs = 3 * 86_400_000) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k?.startsWith(PREFIX)) continue;
      const t = Number(/^\{"t":(\d+)/.exec(localStorage.getItem(k) ?? "")?.[1] ?? 0);
      if (Date.now() - t > maxAgeMs) localStorage.removeItem(k);
    }
  } catch {
    /* storage unavailable */
  }
}
if (typeof window !== "undefined") setTimeout(pruneStored, 5000);

function entry<T>(key: string, persist: boolean): Entry<T> {
  let e = entries.get(key) as Entry<T> | undefined;
  if (!e) {
    e = { data: persist ? readStored<T>(key) : undefined, fetchedAt: 0, promise: null, load: null, tables: [], subs: new Set(), seq: 0, persist, dirty: false };
    entries.set(key, e as Entry);
  }
  return e;
}

const emit = (e: Entry) => e.subs.forEach((f) => f());

function fetchEntry(key: string, e: Entry): Promise<void> {
  if (e.promise) return e.promise;
  if (!e.load) return Promise.resolve();
  const seq = e.seq;
  const load = e.load;
  e.dirty = false;
  e.promise = load()
    .then((data) => {
      e.promise = null;
      if (e.seq !== seq) return fetchEntry(key, e); // a local write happened meanwhile → ask again
      e.data = data;
      e.fetchedAt = Date.now();
      if (e.persist) writeStored(key, data);
      emit(e);
    })
    .catch((err) => {
      // Offline or a failing query: keep what we have, mark as "tried" so the UI leaves its loading state.
      e.promise = null;
      if (!e.fetchedAt) e.fetchedAt = 1;
      console.error(`[live] ${key}:`, err instanceof Error ? err.message : err);
      emit(e);
    });
  return e.promise;
}

/** Refetch every query that reads one of these tables (all queries when called without arguments). */
export function invalidate(...tables: string[]) {
  for (const [key, e] of entries) {
    if (tables.length && !e.tables.some((t) => tables.includes(t))) continue;
    if (e.subs.size) void fetchEntry(key, e);
    else e.dirty = true;
  }
}

const pending = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** Like `invalidate`, but batches bursts (e.g. several realtime events of one transaction) into a single refetch. */
export function invalidateSoon(table: string, delay = 120) {
  pending.add(table);
  flushTimer ??= setTimeout(() => {
    flushTimer = null;
    const tables = [...pending];
    pending.clear();
    invalidate(...tables);
  }, delay);
}

/** Forget everything (sign-out): memory and the persisted snapshots. */
export function clearCache() {
  entries.clear();
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) localStorage.removeItem(k);
    }
  } catch {
    /* storage unavailable */
  }
}

/** Read the current cached value of a query outside React (e.g. the reward system watching the character). */
export function peek<T>(key: string): T | undefined {
  return entries.get(key)?.data as T | undefined;
}

/** Listen to a query from outside React; returns an unsubscribe function. Does not trigger fetching by itself. */
export function watch(key: string, cb: () => void): () => void {
  const e = entry(key, true);
  e.subs.add(cb);
  return () => void e.subs.delete(cb);
}

let lastVisible = Date.now();
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    // Coming back to the app: everything on screen may be stale (Claude changes data in the chat meanwhile).
    if (Date.now() - lastVisible > 2000) invalidate();
    lastVisible = Date.now();
  });
  window.addEventListener("online", () => invalidate());
}

const FRESH_MS = 4000;

/**
 * Subscribe a component to a cached query.
 * `key` identifies the query (include its parameters), `tables` are the tables whose changes make it stale.
 */
export function useLive<T>(key: string, load: () => Promise<T>, tables: string[], initial: T, opts: { persist?: boolean } = {}) {
  const e = entry<T>(key, opts.persist ?? true);
  e.load = load;
  e.tables = tables;

  const subscribe = useCallback(
    (cb: () => void) => {
      const en = entry<T>(key, opts.persist ?? true);
      en.subs.add(cb);
      return () => void en.subs.delete(cb);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const data = useSyncExternalStore(subscribe, () => e.data);
  const fetched = useSyncExternalStore(subscribe, () => e.fetchedAt);

  useEffect(() => {
    const en = entry<T>(key, opts.persist ?? true);
    if (en.dirty || Date.now() - en.fetchedAt > FRESH_MS) void fetchEntry(key, en as Entry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const setData = useCallback(
    (next: T | ((prev: T) => T)) => {
      const en = entry<T>(key, true);
      en.data = typeof next === "function" ? (next as (p: T) => T)(en.data ?? initial) : next;
      en.seq++;
      emit(en as Entry);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  const refresh = useCallback(async () => {
    const en = entry<T>(key, true);
    en.seq++; // make sure a fetch that is already running is not taken as the answer
    await fetchEntry(key, en as Entry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // `fresh`: this value came from the server in this session (not just the snapshot kept from the last visit)
  return { data: data ?? initial, setData, loading: data === undefined && !fetched, fresh: fetched > 1, refresh };
}

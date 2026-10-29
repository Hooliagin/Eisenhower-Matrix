import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
});

/**
 * Run a query in the background. Supabase query builders are lazy – they only hit the
 * network once awaited/then'd – so `void supabase.from(...).update(...)` silently does nothing.
 */
export function fire(query: PromiseLike<{ error: { message: string } | null }>) {
  query.then(({ error }) => error && console.error(error.message), (e) => console.error(e));
}

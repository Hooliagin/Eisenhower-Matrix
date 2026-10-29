-- Claude's MCP edits to existing rows need a confirmation that doesn't reach Joshua, so Claude queues them here instead
-- and Joshua confirms them in the app with one tap (the app applies them with his own session under RLS).
create table public.change_requests (
  id uuid primary key default gen_random_uuid(),
  table_name text not null check (table_name in (
    'meals', 'tasks', 'set_logs', 'drink_log', 'exercises', 'routines', 'events', 'followups', 'books', 'reading_log',
    'skills', 'achievements', 'character_meta', 'character_stats', 'measurements', 'poems', 'poem_attempts',
    'workout_sessions', 'template_exercises', 'shopping_items', 'nutrition_settings', 'breath_sessions', 'detox_sessions')),
  row_id text not null,                      -- primary key of the target row (uuid or int as text)
  action text not null default 'update' check (action in ('update', 'delete')),
  patch jsonb,                               -- new column values for 'update'
  summary text not null,                     -- what Joshua sees, e.g. "Quark: 500 g → 250 g + 100 g Haferflocken (620 kcal)"
  status text not null default 'pending' check (status in ('pending', 'applied', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
alter table public.change_requests enable row level security;
create policy "owner full access" on public.change_requests for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
alter publication supabase_realtime add table public.change_requests;

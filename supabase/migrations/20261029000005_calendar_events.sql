create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_date date not null,
  start_time time,
  end_time time,
  notes text,
  source text not null default 'app' check (source in ('app', 'claude')),
  created_at timestamptz not null default now()
);
create index events_date_idx on public.events (event_date);
alter table public.events enable row level security;
create policy "owner full access" on public.events for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
alter publication supabase_realtime add table public.events;

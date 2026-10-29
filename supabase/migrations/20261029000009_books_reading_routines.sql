-- Reading list with progress
create table public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text,
  field text not null default 'Sonstiges',          -- Fiction, Non-Fiction: Elitentheorie, Life Skills, Religion …
  status text not null default 'want'
    check (status in ('reading', 'want', 'to_buy', 'idea', 'done')),
  progress_pct int check (progress_pct between 0 and 100),
  notes text,
  position int not null default 0,
  finished_at date,
  source text not null default 'app' check (source in ('app', 'claude')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger books_updated_at before update on public.books
  for each row execute function public.set_updated_at();

create table public.reading_log (
  id uuid primary key default gen_random_uuid(),
  log_date date not null default (now() at time zone 'Europe/Berlin')::date,
  minutes int not null check (minutes > 0),
  book_id uuid references public.books(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index reading_log_date_idx on public.reading_log (log_date desc);
create index reading_log_book_idx on public.reading_log (book_id);

-- Daily routines that become a task each day (e.g. 10 min Tageslichtlampe am Morgen)
create table public.routines (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  estimate_minutes int check (estimate_minutes > 0),
  planned_start time,
  position int not null default 0,      -- order at the start of the day
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.tasks add column routine_id uuid references public.routines(id) on delete set null;
create unique index tasks_routine_day_uniq on public.tasks (routine_id, due_date) where routine_id is not null;

-- Idempotent: creates the day's routine tasks, placed before everything else in the plan.
create or replace function public.spawn_routine_tasks(d date)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.tasks (title, quadrant, due_date, estimate_minutes, planned_start, routine_id, source, position)
  select r.title, 'do', d, r.estimate_minutes, r.planned_start, r.id, 'claude',
         extract(epoch from d::timestamp) + r.position
  from public.routines r
  where r.active
  on conflict (routine_id, due_date) where routine_id is not null do nothing;
$$;
revoke execute on function public.spawn_routine_tasks(date) from anon, public;
grant execute on function public.spawn_routine_tasks(date) to authenticated;

alter table public.projects add column kind text not null default 'default' check (kind in ('default', 'books'));

do $$
declare t text;
begin
  foreach t in array array['books', 'reading_log', 'routines'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "owner full access" on public.%I for all to authenticated
                    using ((select public.is_owner())) with check ((select public.is_owner()))', t);
  end loop;
end $$;
alter publication supabase_realtime add table public.books, public.reading_log, public.routines;

-- Expose routine_id through the planning view (append only).
create or replace view public.tasks_planned
with (security_invoker = true)
as
with factor as (
  select count(*) as samples,
         percentile_cont(0.5) within group (order by actual_minutes::float / estimate_minutes) as ratio
  from (
    select actual_minutes, estimate_minutes from public.tasks
    where done and actual_minutes is not null and estimate_minutes is not null
    order by done_at desc limit 30
  ) r
)
select t.id, t.title, t.notes, t.quadrant, t.position, t.due_date, t.done, t.done_at, t.source, t.created_at,
       t.updated_at, t.estimate_minutes, t.actual_minutes, t.started_at, t.planned_start,
       h.samples as history_samples,
       h.median_minutes as history_minutes,
       case when f.samples >= 3 then least(3, greatest(0.5, f.ratio)) else 1 end as estimate_factor,
       greatest(5, round(coalesce(
         h.median_minutes,
         t.estimate_minutes * (case when f.samples >= 3 then least(3, greatest(0.5, f.ratio)) else 1 end),
         30
       )))::int as planned_minutes,
       t.project_id,
       t.routine_id
from public.tasks t
cross join factor f
left join lateral (
  select count(*) as samples,
         percentile_cont(0.5) within group (order by p.actual_minutes) as median_minutes
  from (
    select actual_minutes from public.tasks p
    where p.done and p.actual_minutes is not null and p.id <> t.id
      and public.title_key(p.title) = public.title_key(t.title)
    order by p.done_at desc limit 5
  ) p
  having count(*) > 0
) h on true;

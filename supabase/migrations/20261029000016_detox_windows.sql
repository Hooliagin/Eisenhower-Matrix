-- Self-accountability windows: evening (no screens before sleep) and morning (no phone/social media after waking).
create table public.detox_sessions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('evening', 'morning')),
  started_at timestamptz not null default now(),
  duration_min int not null check (duration_min > 0),
  result text check (result in ('success', 'fail')),
  answered_at timestamptz,
  created_at timestamptz not null default now()
);
create index detox_sessions_started_idx on public.detox_sessions (started_at desc);
alter table public.detox_sessions enable row level security;
create policy "owner full access" on public.detox_sessions for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
alter publication supabase_realtime add table public.detox_sessions;

-- Kept windows count as Erde (sleep & basics) in the elements view.
create or replace view public.element_events
with (security_invoker = true)
as
select 'feuer'::text as element, s.session_date as day, 75 as minutes, 'Training'::text as label
from public.workout_sessions s where s.finished_at is not null
union all
select 'feuer', e.event_date, e.ride_km_each_way * 2 * 3, 'Rad zum Dienst (' || e.ride_km_each_way * 2 || ' km)'
from public.events e
where e.ride_km_each_way is not null and e.event_date <= (now() at time zone 'Europe/Berlin')::date
union all
select case when b.field = 'Religion' then 'wasser' else 'luft' end, r.log_date, r.minutes, coalesce(b.title, 'Lesen')
from public.reading_log r left join public.books b on b.id = r.book_id
union all
select coalesce(t.element, public.element_of(t.attribute)), (t.done_at at time zone 'Europe/Berlin')::date,
       coalesce(t.actual_minutes, t.estimate_minutes, 20), t.title
from public.tasks t
where t.done and t.done_at is not null and coalesce(t.element, public.element_of(t.attribute)) is not null
union all
select 'erde', (d.started_at at time zone 'Europe/Berlin')::date, d.duration_min,
       case d.kind when 'evening' then 'Abend ohne Bildschirm' else 'Morgen ohne Handy' end
from public.detox_sessions d where d.result = 'success';

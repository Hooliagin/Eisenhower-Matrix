-- Three more character attributes
alter table public.tasks drop constraint tasks_attribute_check;
alter table public.tasks add constraint tasks_attribute_check
  check (attribute in ('koerper', 'intellekt', 'charisma', 'spirit', 'kreativ', 'verbunden'));
alter table public.character_stats drop constraint character_stats_attribute_check;
alter table public.character_stats add constraint character_stats_attribute_check
  check (attribute in ('koerper', 'intellekt', 'charisma', 'spirit', 'kreativ', 'verbunden'));

-- The four elements: feuer (Antrieb), wasser (Gefühl/Verbindung), erde (Basis/Ordnung), luft (Geist/Kommunikation)
alter table public.tasks add column element text check (element in ('feuer', 'wasser', 'erde', 'luft'));

alter table public.routines
  add column attribute text check (attribute in ('koerper', 'intellekt', 'charisma', 'spirit', 'kreativ', 'verbunden')),
  add column element text check (element in ('feuer', 'wasser', 'erde', 'luft'));

create or replace function public.spawn_routine_tasks(d date)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.tasks (title, quadrant, due_date, estimate_minutes, planned_start, routine_id, attribute, element, source, position)
  select r.title, 'do', d, r.estimate_minutes, r.planned_start, r.id, r.attribute, r.element, 'claude',
         extract(epoch from d::timestamp) + r.position
  from public.routines r
  where r.active
  on conflict (routine_id, due_date) where routine_id is not null do nothing;
$$;

create or replace function public.element_of(attribute text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case attribute
    when 'koerper' then 'feuer' when 'kreativ' then 'feuer'
    when 'spirit' then 'wasser' when 'verbunden' then 'wasser'
    when 'intellekt' then 'luft' when 'charisma' then 'luft'
  end;
$$;

create or replace view public.character_summary
with (security_invoker = true)
as
with today as (select (now() at time zone 'Europe/Berlin')::date as d)
select a.attribute,
       coalesce(sum(e.xp), 0)::int as xp_total,
       coalesce(sum(e.xp) filter (where e.day > today.d - 14), 0)::int as xp_14,
       coalesce(sum(e.xp) filter (where e.day <= today.d - 14 and e.day > today.d - 28), 0)::int as xp_prev_14
from (values ('koerper'), ('intellekt'), ('charisma'), ('spirit'), ('kreativ'), ('verbunden')) as a(attribute)
cross join today
left join public.xp_events e on e.attribute = a.attribute
group by a.attribute, today.d;

-- Minutes per element per day (what the user puts into each element)
create or replace view public.element_events
with (security_invoker = true)
as
select 'feuer'::text as element, s.session_date as day, 75 as minutes, 'Training'::text as label
from public.workout_sessions s where s.finished_at is not null
union all
select 'luft', r.log_date, r.minutes, coalesce((select b.title from public.books b where b.id = r.book_id), 'Lesen')
from public.reading_log r
union all
select coalesce(t.element, public.element_of(t.attribute)), (t.done_at at time zone 'Europe/Berlin')::date,
       coalesce(t.actual_minutes, t.estimate_minutes, 20), t.title
from public.tasks t
where t.done and t.done_at is not null and coalesce(t.element, public.element_of(t.attribute)) is not null;

grant select on public.element_events to authenticated;
revoke all on public.element_events from anon;

-- Expose attribute + element through the planning view (append only).
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
       t.routine_id,
       t.attribute,
       t.element
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

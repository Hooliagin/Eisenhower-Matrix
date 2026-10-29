-- Interval timer config, e.g. {"rounds": 3, "work": 180, "rest": 30} (seconds). Copied from routine to the day's task.
alter table public.routines add column timer jsonb;
alter table public.tasks add column timer jsonb;

create or replace function public.spawn_routine_tasks(d date)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.tasks (title, quadrant, due_date, estimate_minutes, planned_start, routine_id, attribute, element, timer, source, position)
  select r.title, 'do', d, r.estimate_minutes, r.planned_start, r.id, r.attribute, r.element, r.timer, 'claude',
         extract(epoch from d::timestamp) + r.position
  from public.routines r
  where r.active and (r.weekdays is null or extract(isodow from d)::int = any (r.weekdays))
  on conflict (routine_id, due_date) where routine_id is not null do nothing;
$$;

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
       t.element,
       t.timer
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

-- ISO weekdays (1 = Mo … 7 = So) a routine is due on; null = every day.
alter table public.routines add column weekdays int[] check (weekdays <@ array[1,2,3,4,5,6,7]);

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
  where r.active and (r.weekdays is null or extract(isodow from d)::int = any (r.weekdays))
  on conflict (routine_id, due_date) where routine_id is not null do nothing;
$$;

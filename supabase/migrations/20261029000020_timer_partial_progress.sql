-- Interrupted timer sessions keep their progress ("später weitermachen").
alter table public.tasks add column progress_seconds int not null default 0 check (progress_seconds >= 0);

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
       t.project_id, t.routine_id, t.attribute, t.element, t.timer, t.anytime,
       t.progress_seconds
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

-- Partial progress of unfinished tasks counts on the day it was saved.
create or replace view public.xp_events
with (security_invoker = true)
as
select 'koerper'::text as attribute, s.session_date as day, 75 as xp, 'Training'::text as label
from public.workout_sessions s where s.finished_at is not null
union all
select 'koerper', e.event_date, e.ride_km_each_way * 2 * 3, 'Rad zum Dienst (' || e.ride_km_each_way * 2 || ' km)'
from public.events e
where e.ride_km_each_way is not null and e.event_date <= (now() at time zone 'Europe/Berlin')::date
union all
select case when b.field = 'Religion' then 'spirit' else 'intellekt' end, r.log_date, r.minutes, coalesce(b.title, 'Lesen')
from public.reading_log r left join public.books b on b.id = r.book_id
union all
select t.attribute, (t.done_at at time zone 'Europe/Berlin')::date, coalesce(t.actual_minutes, t.estimate_minutes, 20), t.title
from public.tasks t where t.done and t.attribute is not null and t.done_at is not null
union all
select t.attribute, (t.updated_at at time zone 'Europe/Berlin')::date, round(t.progress_seconds / 60.0)::int, t.title || ' (teilweise)'
from public.tasks t where not t.done and t.attribute is not null and t.progress_seconds >= 30;

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
select coalesce(t.element, public.element_of(t.attribute)), (t.updated_at at time zone 'Europe/Berlin')::date,
       round(t.progress_seconds / 60.0)::int, t.title || ' (teilweise)'
from public.tasks t
where not t.done and t.progress_seconds >= 30 and coalesce(t.element, public.element_of(t.attribute)) is not null
union all
select 'erde', (d.started_at at time zone 'Europe/Berlin')::date, d.duration_min,
       case d.kind when 'evening' then 'Abend ohne Bildschirm' else 'Morgen ohne Handy' end
from public.detox_sessions d where d.result = 'success';

create or replace view public.nutrition_daily
with (security_invoker = true)
as
with s as (select * from public.nutrition_settings where id = 1),
days as (
  select generate_series((now() at time zone 'Europe/Berlin')::date - 29, (now() at time zone 'Europe/Berlin')::date, '1 day')::date as day
),
coffee as (
  select x.day, count(*) as n from public.drink_log x where x.kind = 'coffee' group by x.day
)
select d.day,
  (coalesce((select sum(m.kcal) from public.meals m where m.day = d.day), 0) + coalesce(c.n, 0) * s.coffee_kcal)::int as kcal_in,
  (coalesce((select sum(m.protein_g) from public.meals m where m.day = d.day), 0) + coalesce(c.n, 0) * s.coffee_protein_g)::numeric(6,1) as protein_g,
  (coalesce((select sum(m.protein_g * m.protein_quality) from public.meals m where m.day = d.day), 0) + coalesce(c.n, 0) * s.coffee_protein_g)::numeric(6,1) as protein_effective_g,
  round(s.body_weight_kg * s.protein_g_per_kg)::int as protein_target_g,
  coalesce((select sum(x.ml) from public.drink_log x where x.day = d.day), 0)::int as fluid_ml,
  coalesce((select sum(x.ml) from public.drink_log x where x.day = d.day and x.kind <> 'coffee'), 0)::int as water_ml,
  coalesce(c.n, 0)::int as coffees,
  (coalesce(c.n, 0) * s.caffeine_mg_per_coffee)::int as caffeine_mg,
  s.fluid_target_ml,
  round(s.ree_kcal * s.base_pal)::int as burn_base,
  (coalesce((select count(*) from public.workout_sessions w where w.session_date = d.day and w.finished_at is not null), 0) * s.workout_kcal
   + coalesce((select sum(e.ride_km_each_way * 2) from public.events e where e.event_date = d.day and e.ride_km_each_way is not null), 0) * s.ride_kcal_per_km
   + coalesce((select sum(coalesce(e.shift_hours, extract(epoch from (e.end_time - e.start_time)) / 3600)) from public.events e
               where e.event_date = d.day and e.kind = 'dienst'
                 and (e.shift_hours is not null or (e.start_time is not null and e.end_time > e.start_time))), 0) * s.shift_kcal_per_hour
   + (coalesce((select sum(coalesce(t.actual_minutes, t.estimate_minutes, 20)) from public.tasks t
                where t.done and t.attribute = 'koerper' and (t.done_at at time zone 'Europe/Berlin')::date = d.day), 0)
      + coalesce((select sum(t.progress_seconds / 60.0) from public.tasks t
                  where not t.done and t.attribute = 'koerper' and t.progress_seconds >= 30
                    and (t.updated_at at time zone 'Europe/Berlin')::date = d.day), 0)) * s.active_task_kcal_per_min
  )::int as burn_activity,
  (select e.id from public.events e where e.event_date = d.day and e.kind = 'dienst' order by e.created_at limit 1) as shift_event_id,
  (select coalesce(e.shift_hours, round((extract(epoch from (e.end_time - e.start_time)) / 3600)::numeric, 1))
     from public.events e where e.event_date = d.day and e.kind = 'dienst' order by e.created_at limit 1) as shift_hours,
  (select e.ride_km_each_way is not null from public.events e where e.event_date = d.day and e.kind = 'dienst' order by e.created_at limit 1) as shift_by_bike
from days d cross join s left join coffee c on c.day = d.day;

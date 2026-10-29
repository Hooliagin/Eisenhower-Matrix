-- Walk after meals (Joshua: ideally with Pouchi, helps digestion/blood sugar): minutes per meal; counts like
-- other activity: Körper XP, Erde (routine/basis), +4 kcal/min, and a per-day count in the progress metrics.
alter table public.meals add column walk_minutes int check (walk_minutes is null or walk_minutes between 1 and 240);

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
   + coalesce((select sum(m.walk_minutes) from public.meals m where m.day = d.day), 0) * 4
  )::int as burn_activity,
  (select e.id from public.events e where e.event_date = d.day and e.kind = 'dienst' order by e.created_at limit 1) as shift_event_id,
  (select coalesce(e.shift_hours, round((extract(epoch from (e.end_time - e.start_time)) / 3600)::numeric, 1))
     from public.events e where e.event_date = d.day and e.kind = 'dienst' order by e.created_at limit 1) as shift_hours,
  (select e.ride_km_each_way is not null from public.events e where e.event_date = d.day and e.kind = 'dienst' order by e.created_at limit 1) as shift_by_bike,
  s.kcal_surplus
from days d cross join s left join coffee c on c.day = d.day;

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
from public.tasks t where not t.done and t.attribute is not null and t.progress_seconds >= 30
union all
select 'intellekt', (a.created_at at time zone 'Europe/Berlin')::date, greatest(1, round(a.seconds / 60.0))::int,
       'Gedicht: ' || p.title
from public.poem_attempts a join public.poems p on p.id = a.poem_id
union all
select 'intellekt', p.mastered_on, 60, 'Gedicht gemeistert: ' || p.title
from public.poems p where p.mastered_on is not null
union all
-- walk after a meal (ideally with Pouchi)
select 'koerper', m.day, m.walk_minutes, 'Gehen nach dem Essen'
from public.meals m where m.walk_minutes > 0;

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
from public.detox_sessions d where d.result = 'success'
union all
select 'luft', (a.created_at at time zone 'Europe/Berlin')::date, greatest(1, round(a.seconds / 60.0))::int, 'Gedicht: ' || p.title
from public.poem_attempts a join public.poems p on p.id = a.poem_id
union all
select 'erde', m.day, m.walk_minutes, 'Gehen nach dem Essen'
from public.meals m where m.walk_minutes > 0;

create or replace view public.metric_daily
with (security_invoker = true)
as
-- longest Wim Hof breath hold of the day (s)
select 'breath_hold'::text as metric, 'Luft anhalten (Wim Hof)'::text as label, 's'::text as unit, true as higher_better,
       b.day, max(h)::numeric as value
from public.breath_sessions b, unnest(b.holds) h
where b.exercise = 'wimhof'
group by b.day
union all
-- strength: best estimated 1RM per exercise and day (Epley, sets up to 12 reps)
select 'e1rm:' || e.name, e.name || ' (e1RM)', 'kg', true, s.session_date,
       round(max(l.weight * (1 + l.reps / 30.0)), 1)
from public.set_logs l
join public.workout_sessions s on s.id = l.session_id
join public.exercises e on e.id = l.exercise_id
where e.metric = 'weight_reps' and l.weight > 0 and l.reps between 1 and 12
group by e.name, s.session_date
union all
-- meals followed by a walk (count per day)
select 'post_meal_walks', 'Gehen nach dem Essen', 'x', true, m.day, count(*) filter (where m.walk_minutes > 0)::numeric
from public.meals m group by m.day
union all
select 'reading_min', 'Lesen', 'min', true, r.log_date, sum(r.minutes)::numeric
from public.reading_log r group by r.log_date
union all
select 'meditation_min', 'Meditieren & Atmen', 'min', true, (t.done_at at time zone 'Europe/Berlin')::date,
       sum(coalesce(t.actual_minutes, t.estimate_minutes, 10))::numeric
from public.tasks t
where t.done and (t.title ilike 'Meditieren%' or t.title ilike 'Atemübung:%')
group by 5
union all
select 'xp', 'XP gesamt', 'XP', true, x.day, sum(x.xp)::numeric
from public.xp_events x group by x.day
union all
select 'protein_eff', 'Verwertbares Protein', 'g', true, n.day, n.protein_effective_g
from public.nutrition_daily n where n.kcal_in > 0
union all
select 'fluid_ml', 'Getrunken', 'ml', true, n.day, n.fluid_ml::numeric
from public.nutrition_daily n where n.fluid_ml > 0;

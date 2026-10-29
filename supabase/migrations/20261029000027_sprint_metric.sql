-- Sprints: time over a fixed distance (seconds with hundredths, meters = distance); best time per distance as a metric.
alter table public.exercises drop constraint exercises_metric_check;
alter table public.exercises add constraint exercises_metric_check
  check (metric in ('weight_reps', 'weight_time', 'weight_distance', 'sprint'));
alter table public.set_logs alter column seconds type numeric(7,2);
update public.exercises set metric = 'sprint',
  notes = 'Zeit pro Sprint (s) + Strecke (m); Sprint-Timer misst automatisch' where name = 'Sprints';
update public.template_exercises te set target_reps = '60 m'
from public.exercises e where e.id = te.exercise_id and e.name = 'Sprints';

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
-- sprint: best time per distance (lower is better)
select 'sprint:' || l.meters, 'Sprint ' || l.meters || ' m', 'sek', false, s.session_date, min(l.seconds)
from public.set_logs l
join public.workout_sessions s on s.id = l.session_id
join public.exercises e on e.id = l.exercise_id
where e.metric = 'sprint' and l.seconds > 0 and l.meters > 0
group by l.meters, s.session_date
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

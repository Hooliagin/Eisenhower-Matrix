-- Breathing sessions with measurable results (Wim Hof hold times, measured breathing rate)
create table public.breath_sessions (
  id uuid primary key default gen_random_uuid(),
  day date not null default (now() at time zone 'Europe/Berlin')::date,
  exercise text not null,                 -- id from src/lib/breath.ts (e.g. 'wimhof')
  name text not null,
  duration_s int not null,
  holds int[] not null default '{}',      -- open breath holds in seconds, in order
  avg_rate numeric(4,1),                  -- breaths/min measured by the motion sensor, if on
  task_id uuid references public.tasks(id) on delete set null,
  created_at timestamptz not null default now()
);
create index breath_sessions_day_idx on public.breath_sessions (exercise, day);
alter table public.breath_sessions enable row level security;
create policy "owner full access" on public.breath_sessions for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
alter publication supabase_realtime add table public.breath_sessions;

-- One value per metric and day: everything where "better than usual" is meaningful.
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

-- Per metric: latest value vs. the usual (avg of the previous 28 days with data) and the all-time best before it.
create or replace view public.metric_progress
with (security_invoker = true)
as
with latest as (
  select distinct on (metric) metric, label, unit, higher_better, day, value
  from public.metric_daily order by metric, day desc
)
select l.metric, l.label, l.unit, l.higher_better, l.day as latest_day, l.value as latest,
       p0.avg_prev, p.best_prev, p.n_prev, a.best_all,
       (p.n_prev > 0 and case when l.higher_better then l.value > p.best_prev else l.value < p.best_prev end) as is_record,
       (p0.avg_prev is not null and case when l.higher_better then l.value > p0.avg_prev else l.value < p0.avg_prev end) as above_avg
from latest l
cross join lateral (
  select round(avg(m.value), 1) as avg_prev
  from public.metric_daily m
  where m.metric = l.metric and m.day < l.day and m.day >= l.day - 28
) p0
cross join lateral (
  select case when l.higher_better then max(m.value) else min(m.value) end as best_prev, count(*)::int as n_prev
  from public.metric_daily m where m.metric = l.metric and m.day < l.day
) p
cross join lateral (
  select case when l.higher_better then max(m.value) else min(m.value) end as best_all
  from public.metric_daily m where m.metric = l.metric
) a;

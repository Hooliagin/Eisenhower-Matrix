-- "Anytime" routines: quick daily habits done whenever (home quick-buttons), not laid out in the day plan.
alter table public.routines add column anytime boolean not null default false;
alter table public.tasks add column anytime boolean not null default false;

create or replace function public.spawn_routine_tasks(d date)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.tasks (title, quadrant, due_date, estimate_minutes, planned_start, routine_id, attribute, element, timer, anytime, source, position)
  select r.title, 'do', d, r.estimate_minutes, r.planned_start, r.id, r.attribute, r.element, r.timer, r.anytime, 'claude',
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
       t.project_id, t.routine_id, t.attribute, t.element, t.timer,
       t.anytime
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

-- Drinks
create table public.drink_log (
  id uuid primary key default gen_random_uuid(),
  day date not null default (now() at time zone 'Europe/Berlin')::date,
  kind text not null check (kind in ('water_glass', 'water_bottle', 'coffee')),
  ml int not null check (ml > 0),
  created_at timestamptz not null default now()
);
create index drink_log_day_idx on public.drink_log (day);

-- Meals, estimated by Claude from what the user tells
create table public.meals (
  id uuid primary key default gen_random_uuid(),
  day date not null default (now() at time zone 'Europe/Berlin')::date,
  meal text,                                    -- Frühstück, Mittag, Abend, Snack
  description text not null,
  kcal int not null check (kcal >= 0),
  protein_g numeric(5,1) not null default 0,
  protein_quality numeric(3,2) not null default 1 check (protein_quality between 0 and 1),  -- DIAAS-weighted, capped at 1
  carbs_g numeric(5,1),
  fat_g numeric(5,1),
  fiber_g numeric(5,1),
  notes text,
  source text not null default 'claude' check (source in ('app', 'claude')),
  created_at timestamptz not null default now()
);
create index meals_day_idx on public.meals (day);

-- Single-row personal constants for energy & intake targets (Claude keeps them current)
create table public.nutrition_settings (
  id int primary key default 1 check (id = 1),
  body_weight_kg numeric(5,1) not null,
  ree_kcal int not null,                 -- resting energy expenditure
  base_pal numeric(3,2) not null,        -- everyday activity without sport
  workout_kcal int not null,             -- net extra per finished strength session
  ride_kcal_per_km numeric(4,1) not null,
  active_task_kcal_per_min numeric(4,1) not null,  -- tasks with attribute koerper (e.g. shadow boxing)
  protein_g_per_kg numeric(3,1) not null,
  fluid_target_ml int not null,
  glass_ml int not null,
  bottle_ml int not null,
  coffee_ml int not null,
  caffeine_mg_per_coffee int not null,
  updated_at timestamptz not null default now()
);
insert into public.nutrition_settings values
  (1, 80.1, 1834, 1.40, 300, 25, 8, 1.8, 2500, 250, 1000, 250, 100, now());

-- Per-day intake vs. estimated expenditure
create or replace view public.nutrition_daily
with (security_invoker = true)
as
with s as (select * from public.nutrition_settings where id = 1),
days as (
  select generate_series((now() at time zone 'Europe/Berlin')::date - 29, (now() at time zone 'Europe/Berlin')::date, '1 day')::date as day
)
select d.day,
  coalesce((select sum(m.kcal) from public.meals m where m.day = d.day), 0)::int as kcal_in,
  coalesce((select sum(m.protein_g) from public.meals m where m.day = d.day), 0)::numeric(6,1) as protein_g,
  coalesce((select sum(m.protein_g * m.protein_quality) from public.meals m where m.day = d.day), 0)::numeric(6,1) as protein_effective_g,
  round(s.body_weight_kg * s.protein_g_per_kg)::int as protein_target_g,
  coalesce((select sum(x.ml) from public.drink_log x where x.day = d.day), 0)::int as fluid_ml,
  coalesce((select sum(x.ml) from public.drink_log x where x.day = d.day and x.kind <> 'coffee'), 0)::int as water_ml,
  coalesce((select count(*) from public.drink_log x where x.day = d.day and x.kind = 'coffee'), 0)::int as coffees,
  (coalesce((select count(*) from public.drink_log x where x.day = d.day and x.kind = 'coffee'), 0) * s.caffeine_mg_per_coffee)::int as caffeine_mg,
  s.fluid_target_ml,
  round(s.ree_kcal * s.base_pal)::int as burn_base,
  (coalesce((select count(*) from public.workout_sessions w where w.session_date = d.day and w.finished_at is not null), 0) * s.workout_kcal
   + coalesce((select sum(e.ride_km_each_way * 2) from public.events e where e.event_date = d.day and e.ride_km_each_way is not null), 0) * s.ride_kcal_per_km
   + coalesce((select sum(coalesce(t.actual_minutes, t.estimate_minutes, 20)) from public.tasks t
               where t.done and t.attribute = 'koerper' and (t.done_at at time zone 'Europe/Berlin')::date = d.day), 0) * s.active_task_kcal_per_min
  )::int as burn_activity
from days d cross join s;

grant select on public.nutrition_daily to authenticated;
revoke all on public.nutrition_daily from anon;

do $$
declare t text;
begin
  foreach t in array array['drink_log', 'meals', 'nutrition_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "owner full access" on public.%I for all to authenticated
                    using ((select public.is_owner())) with check ((select public.is_owner()))', t);
  end loop;
end $$;
alter publication supabase_realtime add table public.drink_log, public.meals;

-- Muscle gain phase: daily kcal target = estimated burn + surplus (lean bulk ≈ +10 % ≈ 300 kcal,
-- aims at ~0.25–0.5 kg/month for a trained lifter; set to 0 for maintenance, negative for a cut).
alter table public.nutrition_settings add column kcal_surplus int not null default 0;
update public.nutrition_settings set kcal_surplus = 300, updated_at = now() where id = 1;

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
  (select e.ride_km_each_way is not null from public.events e where e.event_date = d.day and e.kind = 'dienst' order by e.created_at limit 1) as shift_by_bike,
  s.kcal_surplus
from days d cross join s left join coffee c on c.day = d.day;

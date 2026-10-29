-- Which character attribute a task trains (XP when done)
alter table public.tasks add column attribute text check (attribute in ('koerper', 'intellekt', 'charisma'));

-- Raw measurements the user sends (bodyweight, 1RM, mobility tests …)
create table public.measurements (
  id uuid primary key default gen_random_uuid(),
  measured_on date not null default (now() at time zone 'Europe/Berlin')::date,
  metric text not null,
  value numeric not null,
  unit text,
  note text,
  created_at timestamptz not null default now()
);
create index measurements_metric_idx on public.measurements (metric, measured_on desc);

-- Claude's realistic rating (0-100) of sub-skills, e.g. Körper → Oberkörperkraft, Ausdauer, Beweglichkeit
create table public.character_stats (
  id uuid primary key default gen_random_uuid(),
  attribute text not null check (attribute in ('koerper', 'intellekt', 'charisma')),
  name text not null,
  rating int not null check (rating between 0 and 100),
  note text,
  position int not null default 0,
  source text not null default 'claude' check (source in ('app', 'claude')),
  updated_at timestamptz not null default now(),
  unique (attribute, name)
);
create trigger character_stats_updated_at before update on public.character_stats
  for each row execute function public.set_updated_at();

-- 1 XP ≈ 1 invested minute
create or replace view public.xp_events
with (security_invoker = true)
as
select 'koerper'::text as attribute, s.session_date as day, 75 as xp, 'Training'::text as label
from public.workout_sessions s where s.finished_at is not null
union all
select 'intellekt', r.log_date, r.minutes, 'Lesen' from public.reading_log r
union all
select t.attribute, (t.done_at at time zone 'Europe/Berlin')::date, coalesce(t.actual_minutes, t.estimate_minutes, 20), t.title
from public.tasks t where t.done and t.attribute is not null and t.done_at is not null;

create or replace view public.character_summary
with (security_invoker = true)
as
with today as (select (now() at time zone 'Europe/Berlin')::date as d)
select a.attribute,
       coalesce(sum(e.xp), 0)::int as xp_total,
       coalesce(sum(e.xp) filter (where e.day > today.d - 14), 0)::int as xp_14,
       coalesce(sum(e.xp) filter (where e.day <= today.d - 14 and e.day > today.d - 28), 0)::int as xp_prev_14
from (values ('koerper'), ('intellekt'), ('charisma')) as a(attribute)
cross join today
left join public.xp_events e on e.attribute = a.attribute
group by a.attribute, today.d;

grant select on public.xp_events, public.character_summary to authenticated;
revoke all on public.xp_events, public.character_summary from anon;

do $$
declare t text;
begin
  foreach t in array array['measurements', 'character_stats'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "owner full access" on public.%I for all to authenticated
                    using ((select public.is_owner())) with check ((select public.is_owner()))', t);
  end loop;
end $$;
alter publication supabase_realtime add table public.character_stats, public.measurements;

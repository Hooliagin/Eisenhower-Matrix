alter table public.tasks
  add column estimate_minutes int check (estimate_minutes > 0),
  add column actual_minutes int check (actual_minutes > 0),
  add column started_at timestamptz,
  add column planned_start time;

comment on column public.tasks.estimate_minutes is 'User/Claude estimate for this instance';
comment on column public.tasks.actual_minutes is 'Measured or reported duration once done; feeds learning';
comment on column public.tasks.planned_start is 'Fixed start time (local) for the day plan, e.g. training in the evening';

-- Groups repeat tasks ("Wohnung aufräumen!" == "wohnung aufräumen").
create or replace function public.title_key(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(regexp_replace(regexp_replace(lower(t), '[^[:alnum:][:space:]]', ' ', 'g'), '\s+', ' ', 'g'));
$$;

create index tasks_title_key_idx on public.tasks (public.title_key(title)) where done and actual_minutes is not null;

-- Learned duration per task:
--  1. same task done before  -> median of its last 5 actual durations
--  2. else estimate given     -> estimate x personal correction factor (median actual/estimate, >= 3 samples)
--  3. else                    -> 30 min default
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
select t.*,
       h.samples as history_samples,
       h.median_minutes as history_minutes,
       case when f.samples >= 3 then least(3, greatest(0.5, f.ratio)) else 1 end as estimate_factor,
       greatest(5, round(coalesce(
         h.median_minutes,
         t.estimate_minutes * (case when f.samples >= 3 then least(3, greatest(0.5, f.ratio)) else 1 end),
         30
       )))::int as planned_minutes
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

grant select on public.tasks_planned to authenticated;
revoke all on public.tasks_planned from anon;

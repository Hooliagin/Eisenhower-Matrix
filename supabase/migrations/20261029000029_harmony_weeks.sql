-- Element balance as game mechanic: per ISO week (Mon–Sun, Berlin) the minutes per element, a harmony score
-- (normalized entropy of the four shares: 100 = perfectly even, 0 = only one element) and bonus XP for balanced weeks.
create or replace view public.harmony_weeks
with (security_invoker = true)
as
with w as (
  select date_trunc('week', e.day)::date as week_start,
         sum(e.minutes) filter (where e.element = 'feuer') as feuer,
         sum(e.minutes) filter (where e.element = 'wasser') as wasser,
         sum(e.minutes) filter (where e.element = 'erde') as erde,
         sum(e.minutes) filter (where e.element = 'luft') as luft,
         sum(e.minutes) as total
  from public.element_events e
  group by 1
), s as (
  select w.*,
         round(100 * (
           - coalesce(case when feuer > 0 then feuer::numeric / total * ln(feuer::numeric / total) end, 0)
           - coalesce(case when wasser > 0 then wasser::numeric / total * ln(wasser::numeric / total) end, 0)
           - coalesce(case when erde > 0 then erde::numeric / total * ln(erde::numeric / total) end, 0)
           - coalesce(case when luft > 0 then luft::numeric / total * ln(luft::numeric / total) end, 0)
         ) / ln(4))::int as harmony
  from w where total > 0
)
select week_start, coalesce(feuer, 0)::int as feuer, coalesce(wasser, 0)::int as wasser, coalesce(erde, 0)::int as erde,
       coalesce(luft, 0)::int as luft, total::int, harmony,
       week_start + 7 <= (now() at time zone 'Europe/Berlin')::date as complete,
       case when week_start + 7 > (now() at time zone 'Europe/Berlin')::date or total < 300 then 0
            when harmony >= 85 then 100
            when harmony >= 70 then 50
            else 0 end as bonus_xp
from s;

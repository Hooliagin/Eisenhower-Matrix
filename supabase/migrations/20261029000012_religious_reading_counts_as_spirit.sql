create or replace view public.xp_events
with (security_invoker = true)
as
select 'koerper'::text as attribute, s.session_date as day, 75 as xp, 'Training'::text as label
from public.workout_sessions s where s.finished_at is not null
union all
select case when b.field = 'Religion' then 'spirit' else 'intellekt' end, r.log_date, r.minutes, coalesce(b.title, 'Lesen')
from public.reading_log r left join public.books b on b.id = r.book_id
union all
select t.attribute, (t.done_at at time zone 'Europe/Berlin')::date, coalesce(t.actual_minutes, t.estimate_minutes, 20), t.title
from public.tasks t where t.done and t.attribute is not null and t.done_at is not null;

create or replace view public.element_events
with (security_invoker = true)
as
select 'feuer'::text as element, s.session_date as day, 75 as minutes, 'Training'::text as label
from public.workout_sessions s where s.finished_at is not null
union all
select case when b.field = 'Religion' then 'wasser' else 'luft' end, r.log_date, r.minutes, coalesce(b.title, 'Lesen')
from public.reading_log r left join public.books b on b.id = r.book_id
union all
select coalesce(t.element, public.element_of(t.attribute)), (t.done_at at time zone 'Europe/Berlin')::date,
       coalesce(t.actual_minutes, t.estimate_minutes, 20), t.title
from public.tasks t
where t.done and t.done_at is not null and coalesce(t.element, public.element_of(t.attribute)) is not null;

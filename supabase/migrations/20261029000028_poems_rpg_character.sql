-- Poems to memorize (trained in rest pauses, recited via speech recognition, checked by Claude),
-- RPG character: skills with tiers + next step, background achievements (CV), credits (finances).
create table public.poems (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text,
  text text not null,                       -- stanzas separated by a blank line
  status text not null default 'learning' check (status in ('learning', 'mastered', 'paused')),
  learned_stanzas int not null default 0,   -- stanzas that already sit (0 = learning the first)
  started_on date not null default (now() at time zone 'Europe/Berlin')::date,
  mastered_on date,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table public.poem_attempts (
  id uuid primary key default gen_random_uuid(),
  poem_id uuid not null references public.poems(id) on delete cascade,
  stanza_from int not null,                 -- 0-based, inclusive
  stanza_to int not null,                   -- 0-based, inclusive
  mode text not null default 'recite' check (mode in ('recite', 'cloze', 'read')),
  transcript text,
  accuracy numeric(4,3),                    -- share of expected words recited correctly (app's own check)
  seconds int not null default 0,           -- practice time
  feedback text,                            -- Claude's check ("prüf mal")
  checked_at timestamptz,
  created_at timestamptz not null default now()
);
create index poem_attempts_poem_idx on public.poem_attempts (poem_id, created_at desc);

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  attribute text not null check (attribute in ('koerper', 'intellekt', 'charisma', 'spirit', 'kreativ', 'verbunden')),
  name text not null unique,
  icon text,
  tier int not null default 1 check (tier between 0 and 5), -- 0 locked · 1 Novize · 2 Lehrling · 3 Fortgeschritten · 4 Experte · 5 Meister
  note text,                                -- why this tier (honest, like character_stats)
  next_step text,                           -- concrete next quest to reach the next tier
  position int not null default 0,
  updated_at timestamptz not null default now()
);

create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  icon text,
  attribute text check (attribute in ('koerper', 'intellekt', 'charisma', 'spirit', 'kreativ', 'verbunden')),
  kind text not null default 'milestone' check (kind in ('background', 'milestone')), -- background = CV before the app
  earned_on date,
  when_text text,                           -- e.g. "seit ~2016" when no exact date
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table public.character_meta (
  id int primary key default 1 check (id = 1),
  class_title text,                         -- RPG class shown under the name
  credits int not null default 0 check (credits between 0 and 100), -- finances 0–100
  credits_note text,
  credits_next text,
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['poems', 'poem_attempts', 'skills', 'achievements', 'character_meta'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "owner full access" on public.%I for all to authenticated
                    using ((select public.is_owner())) with check ((select public.is_owner()))', t);
  end loop;
end $$;
alter publication supabase_realtime add table public.poems, public.poem_attempts, public.skills, public.achievements, public.character_meta;

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
-- poem practice: minutes in the trainer → Intellekt; a mastered poem gives a bonus
select 'intellekt', (a.created_at at time zone 'Europe/Berlin')::date, greatest(1, round(a.seconds / 60.0))::int,
       'Gedicht: ' || p.title
from public.poem_attempts a join public.poems p on p.id = a.poem_id
union all
select 'intellekt', p.mastered_on, 60, 'Gedicht gemeistert: ' || p.title
from public.poems p where p.mastered_on is not null;

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
from public.poem_attempts a join public.poems p on p.id = a.poem_id;

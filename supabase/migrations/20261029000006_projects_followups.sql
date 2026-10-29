create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji text,
  description text,
  position int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- People to chase: either "todo" (I still have to write them, draft ready)
-- or "waiting" (sent, nudge again on follow_up_on). No draft = plain reminder.
create table public.followups (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  person text not null,
  topic text not null,
  status text not null default 'todo' check (status in ('todo', 'waiting', 'done')),
  last_contact date,
  follow_up_on date,
  wait_days int not null default 2 check (wait_days > 0),
  repeat_days int check (repeat_days > 0),
  draft text,
  notes text,
  source text not null default 'app' check (source in ('app', 'claude')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index followups_due_idx on public.followups (status, follow_up_on);
create index followups_project_idx on public.followups (project_id);
create trigger followups_updated_at before update on public.followups
  for each row execute function public.set_updated_at();

alter table public.tasks add column project_id uuid references public.projects(id) on delete set null;
create index tasks_project_idx on public.tasks (project_id);

do $$
declare t text;
begin
  foreach t in array array['projects', 'followups'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "owner full access" on public.%I for all to authenticated
                    using ((select public.is_owner())) with check ((select public.is_owner()))', t);
  end loop;
end $$;
alter publication supabase_realtime add table public.projects, public.followups;

-- Expose project_id through the planning view (new columns may only be appended).
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
       t.project_id
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

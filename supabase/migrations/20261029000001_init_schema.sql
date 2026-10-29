-- Owner allow-list: only users listed here can read/write anything.
create table public.allowed_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_owner()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from public.allowed_users where user_id = (select auth.uid()));
$$;
revoke execute on function public.is_owner() from anon, public;
grant execute on function public.is_owner() to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Eisenhower matrix
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text,
  quadrant text not null default 'inbox'
    check (quadrant in ('inbox', 'do', 'schedule', 'delegate', 'eliminate')),
  position double precision not null default extract(epoch from now()),
  due_date date,
  done boolean not null default false,
  done_at timestamptz,
  source text not null default 'app' check (source in ('app', 'voice', 'claude')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_quadrant_idx on public.tasks (quadrant, done, position);
create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

-- Habits
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji text,
  target_per_week int not null default 7 check (target_per_week between 1 and 7),
  position int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.habit_logs (
  habit_id uuid not null references public.habits(id) on delete cascade,
  log_date date not null,
  created_at timestamptz not null default now(),
  primary key (habit_id, log_date)
);

-- Fitness
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  metric text not null default 'weight_reps'
    check (metric in ('weight_reps', 'weight_time', 'weight_distance')),
  notes text,
  created_at timestamptz not null default now()
);

create table public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  focus text,
  times_per_week int not null default 1,
  position int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.template_exercises (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.workout_templates(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  position int not null default 0,
  target_sets int not null default 3,
  target_reps text default '8-12',
  rest_seconds int not null default 120,
  superset_group text,
  optional boolean not null default false,
  notes text
);
create index template_exercises_template_idx on public.template_exercises (template_id, position);
create index template_exercises_exercise_idx on public.template_exercises (exercise_id);

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.workout_templates(id) on delete set null,
  session_date date not null default current_date,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  notes text
);
create index workout_sessions_date_idx on public.workout_sessions (session_date desc);
create index workout_sessions_template_idx on public.workout_sessions (template_id);

create table public.set_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  set_number int not null,
  weight numeric(6,2),
  reps int,
  seconds int,
  meters int,
  created_at timestamptz not null default now()
);
create index set_logs_session_idx on public.set_logs (session_id);
create index set_logs_exercise_idx on public.set_logs (exercise_id, created_at desc);

-- RLS: owner-only everywhere
alter table public.allowed_users enable row level security;
create policy "read own allow-list row" on public.allowed_users
  for select to authenticated using (user_id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['tasks','habits','habit_logs','exercises','workout_templates',
                           'template_exercises','workout_sessions','set_logs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "owner full access" on public.%I for all to authenticated
                    using ((select public.is_owner())) with check ((select public.is_owner()))', t);
  end loop;
end $$;

alter publication supabase_realtime add table
  public.tasks, public.habits, public.habit_logs,
  public.workout_templates, public.template_exercises, public.exercises, public.workout_sessions;

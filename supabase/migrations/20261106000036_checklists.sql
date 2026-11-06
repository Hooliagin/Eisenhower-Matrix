-- Wiederkehrende Abhak-Listen in Projekten (z. B. „Checkliste Antonia“ am Ende jedes Dienstes). Ein Haken gilt nur für den Tag
-- (`checked_on`, Europe/Berlin): abgehakte Punkte verschwinden, am nächsten Tag ist die Liste wieder voll.
create table public.checklists (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects (id) on delete cascade,
  title text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.checklists (id) on delete cascade,
  text text not null,
  position int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.checklist_checks (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.checklist_items (id) on delete cascade,
  checked_on date not null default (now() at time zone 'Europe/Berlin')::date,
  checked_at timestamptz not null default now(),
  unique (item_id, checked_on)
);

do $$
declare t text;
begin
  foreach t in array array['checklists', 'checklist_items', 'checklist_checks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "owner full access" on public.%I for all to authenticated
                    using ((select public.is_owner())) with check ((select public.is_owner()))', t);
  end loop;
end $$;
alter publication supabase_realtime add table public.checklists, public.checklist_items, public.checklist_checks;
